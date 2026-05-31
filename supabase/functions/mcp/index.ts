// Vela MCP server (read-only). Exposes Vela's market & portfolio tools to any
// MCP-compatible client (Claude Desktop, Cursor, etc.) via Streamable HTTP.
// Auth: clients must send a Supabase user JWT in the Authorization header.
import { Hono } from 'npm:hono@4';
import { McpServer, StreamableHttpTransport } from 'npm:mcp-lite@0.10.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

function svcClient(authHeader: string | null) {
  return createClient(SUPABASE_URL, ANON_KEY, { global: { headers: authHeader ? { Authorization: authHeader } : {} } });
}

async function callEdge(authHeader: string, fn: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authHeader }, body: JSON.stringify(body),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function getQuote(symbol: string) {
  // Yahoo v7 quote is auth-walled server-side; use the public chart endpoint
  // with an allorigins fallback (same pattern as `market-movers`).
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36';
  const direct = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2d&interval=1d`;
  for (const url of [direct, `https://api.allorigins.win/raw?url=${encodeURIComponent(direct)}`]) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) continue;
      const j = await r.json();
      const m = j?.chart?.result?.[0]?.meta;
      if (!m) continue;
      const price = m.regularMarketPrice ?? m.previousClose;
      const prev = m.previousClose ?? m.chartPreviousClose;
      if (price == null) continue;
      const change = prev != null ? price - prev : 0;
      return {
        symbol: m.symbol ?? symbol,
        name: m.shortName ?? m.longName ?? symbol,
        price,
        change,
        change_pct: prev ? (change / prev) * 100 : 0,
        currency: m.currency,
        exchange: m.fullExchangeName ?? m.exchangeName,
        as_of: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null,
      };
    } catch { /* try next */ }
  }
  return { error: 'symbol not found or upstream unavailable' };
}

// ── Phase 1 catalog: Vela's strategy library (static, no auth) ─────────
const STRATEGY_CATALOG = [
  {
    id: 'buy_hold',
    name: 'Buy & Hold',
    category: 'Passive',
    summary: 'Buy the asset on day 1, hold for the entire window. The baseline every active strategy must beat.',
    risk: 'low',
    horizon: 'long',
    inputs: ['symbol_or_portfolio', 'range'],
  },
  {
    id: 'sma_cross',
    name: 'SMA 20/50 Crossover',
    category: 'Trend following',
    summary: 'Long when the 20-day simple moving average crosses above the 50-day SMA, flat otherwise. Classic momentum filter.',
    risk: 'medium',
    horizon: 'medium',
    inputs: ['symbol_or_portfolio', 'range'],
  },
  {
    id: 'rsi',
    name: 'RSI Mean Reversion (30/70)',
    category: 'Mean reversion',
    summary: 'Buy when 14-day RSI dips below 30 (oversold), sell when it rises above 70 (overbought). Works best on range-bound names.',
    risk: 'medium',
    horizon: 'short',
    inputs: ['symbol_or_portfolio', 'range'],
  },
];

function searchStrategies(query: string, limit = 10) {
  const q = (query || '').toLowerCase().trim();
  const rows = q
    ? STRATEGY_CATALOG.filter((s) =>
        `${s.name} ${s.category} ${s.summary} ${s.id} ${s.risk} ${s.horizon}`.toLowerCase().includes(q),
      )
    : STRATEGY_CATALOG;
  return { count: rows.length, strategies: rows.slice(0, Math.max(1, Math.min(50, limit))) };
}

// ── Phase 1: deterministic market briefing (no AI, no cost) ────────────
const BRIEFING_UNIVERSE: Record<string, Array<{ symbol: string; label: string }>> = {
  us: [
    { symbol: '^GSPC', label: 'S&P 500' },
    { symbol: '^IXIC', label: 'Nasdaq Composite' },
    { symbol: '^DJI', label: 'Dow Jones' },
    { symbol: '^VIX', label: 'VIX (volatility)' },
  ],
  eu: [
    { symbol: '^STOXX50E', label: 'Euro Stoxx 50' },
    { symbol: '^GDAXI', label: 'DAX' },
    { symbol: '^FCHI', label: 'CAC 40' },
    { symbol: 'FTSEMIB.MI', label: 'FTSE MIB' },
  ],
  it: [
    { symbol: 'FTSEMIB.MI', label: 'FTSE MIB' },
    { symbol: '^STOXX50E', label: 'Euro Stoxx 50' },
    { symbol: 'EURUSD=X', label: 'EUR / USD' },
    { symbol: 'BTP10Y.MI', label: 'BTP 10Y' },
  ],
  global: [
    { symbol: '^GSPC', label: 'S&P 500' },
    { symbol: '^STOXX50E', label: 'Euro Stoxx 50' },
    { symbol: '^N225', label: 'Nikkei 225' },
    { symbol: 'EURUSD=X', label: 'EUR / USD' },
    { symbol: 'GC=F', label: 'Gold' },
    { symbol: 'CL=F', label: 'Crude oil (WTI)' },
  ],
};

async function getBriefing(region: string) {
  const key = (region || 'global').toLowerCase();
  const universe = BRIEFING_UNIVERSE[key] ?? BRIEFING_UNIVERSE.global;
  const quotes = await Promise.all(universe.map((u) => getQuote(u.symbol)));
  const items = universe.map((u, i) => {
    const q = quotes[i] as any;
    return q && !q.error
      ? { label: u.label, symbol: u.symbol, price: q.price, change_pct: q.change_pct, currency: q.currency }
      : { label: u.label, symbol: u.symbol, error: q?.error ?? 'unavailable' };
  });
  const ok = items.filter((it: any) => typeof it.change_pct === 'number') as any[];
  const advancers = ok.filter((it) => it.change_pct > 0).length;
  const decliners = ok.filter((it) => it.change_pct < 0).length;
  const headline =
    `Vela market briefing — region "${key}" — ${new Date().toISOString().slice(0, 10)}. ` +
    `${advancers} of ${ok.length} tracked instruments up, ${decliners} down. ` +
    'Snapshot only; no AI commentary in Phase 1.';
  return { region: key, generated_at: new Date().toISOString(), headline, items };
}

const app = new Hono();
const server = new McpServer({ name: 'vela', version: '1.0.0' });

server.tool({
  name: 'get_quote',
  description: '[Phase 1 · public] Latest price + daily change for a Yahoo-style ticker (AAPL, ENI.MI, ASML.AS). No auth required.',
  inputSchema: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] },
  handler: async ({ symbol }: any) => {
    const data = await getQuote(String(symbol).toUpperCase());
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  },
});

server.tool({
  name: 'search_strategies',
  description: "[Phase 1 · public] Search Vela's strategy library by free-text query (name, category, risk, horizon). No auth required.",
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Free-text query, e.g. "momentum", "mean reversion", "low risk"' },
      limit: { type: 'number', description: 'Max results (1–50, default 10)' },
    },
  },
  handler: async ({ query = '', limit = 10 }: any) => {
    const data = searchStrategies(String(query), Number(limit) || 10);
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  },
});

server.tool({
  name: 'get_briefing',
  description: '[Phase 1 · public] Deterministic market briefing for a region (us | eu | it | global). Returns a snapshot of major indices and FX — no AI commentary, no cost. No auth required.',
  inputSchema: {
    type: 'object',
    properties: { region: { type: 'string', description: 'us | eu | it | global (default: global)' } },
  },
  handler: async ({ region = 'global' }: any) => {
    const data = await getBriefing(String(region));
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  },
});

server.tool({
  name: 'get_watchlist',
  description: "Return the authenticated user's watchlist.",
  inputSchema: { type: 'object', properties: {} },
  handler: async (_args: any, ctx: any) => {
    const auth = ctx?.request?.headers?.get?.('authorization');
    if (!auth) return { content: [{ type: 'text', text: 'Missing Authorization header' }] };
    const sb = svcClient(auth);
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return { content: [{ type: 'text', text: 'Invalid token' }] };
    const { data } = await sb.from('watchlist_items').select('symbol, name, created_at').eq('user_id', u.user.id);
    return { content: [{ type: 'text', text: JSON.stringify(data ?? []) }] };
  },
});

server.tool({
  name: 'get_portfolio',
  description: "Return the authenticated user's portfolio holdings.",
  inputSchema: { type: 'object', properties: {} },
  handler: async (_args: any, ctx: any) => {
    const auth = ctx?.request?.headers?.get?.('authorization');
    if (!auth) return { content: [{ type: 'text', text: 'Missing Authorization header' }] };
    const sb = svcClient(auth);
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return { content: [{ type: 'text', text: 'Invalid token' }] };
    const { data } = await sb.from('portfolio_holdings').select('symbol, name, shares, avg_price, currency').eq('user_id', u.user.id);
    return { content: [{ type: 'text', text: JSON.stringify(data ?? []) }] };
  },
});

server.tool({
  name: 'get_news_sentiment',
  description: 'AI sentiment analysis (news headlines + score) for a ticker. Calls Vela analyze-sentiment.',
  inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, name: { type: 'string' } }, required: ['symbol'] },
  handler: async ({ symbol, name }: any, ctx: any) => {
    const auth = ctx?.request?.headers?.get?.('authorization') ?? `Bearer ${ANON_KEY}`;
    const data = await callEdge(auth, 'analyze-sentiment', { symbol, name });
    return { content: [{ type: 'text', text: JSON.stringify(data).slice(0, 4000) }] };
  },
});

server.tool({
  name: 'scan_opportunities',
  description: 'Run the Vela AI scanner against a universe (ftse_mib | sp100 | eu_blue).',
  inputSchema: { type: 'object', properties: { universe: { type: 'string' }, criteria: { type: 'string' }, limit: { type: 'number' } } },
  handler: async ({ universe = 'ftse_mib', criteria = '', limit = 10 }: any, ctx: any) => {
    const auth = ctx?.request?.headers?.get?.('authorization') ?? `Bearer ${ANON_KEY}`;
    const data = await callEdge(auth, 'ai-scanner', { universe, criteria, limit });
    return { content: [{ type: 'text', text: JSON.stringify(data).slice(0, 6000) }] };
  },
});

server.tool({
  name: 'related_instruments',
  description: 'Peers, sector ETF and thematic neighbours for a symbol.',
  inputSchema: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] },
  handler: async ({ symbol }: any, ctx: any) => {
    const auth = ctx?.request?.headers?.get?.('authorization') ?? `Bearer ${ANON_KEY}`;
    const data = await callEdge(auth, 'related-instruments', { symbol });
    return { content: [{ type: 'text', text: JSON.stringify(data).slice(0, 4000) }] };
  },
});

const transport = new StreamableHttpTransport();
app.all('/*', async (c) => transport.handleRequest(c.req.raw, server));

Deno.serve(app.fetch);