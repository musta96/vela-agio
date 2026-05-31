// Vela MCP server. Exposes Vela's market, strategy, and account tools to any
// MCP-compatible client (Claude Desktop, ChatGPT, Cursor…) via Streamable HTTP.
// Hand-rolled JSON-RPC 2.0 — no third-party MCP SDK so the transport stays
// stable across upstream API churn.
//
// Tool phases:
//   Phase 1 (public, no auth):  get_quote · search_strategies · get_briefing
//   Phase 2 (Bearer JWT):       get_watchlist · get_portfolio · get_news_sentiment ·
//                               scan_opportunities · related_instruments
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

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

// ── Tool registry ──────────────────────────────────────────────────────
type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: any, ctx: { authHeader: string | null }) => Promise<unknown>;
};

const tools: ToolDef[] = [
  {
    name: 'get_quote',
    description: '[Phase 1 · public] Latest price + daily change for a Yahoo-style ticker (AAPL, ENI.MI, ASML.AS). No auth required.',
    inputSchema: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] },
    handler: async ({ symbol }) => getQuote(String(symbol).toUpperCase()),
  },
  {
    name: 'search_strategies',
    description: "[Phase 1 · public] Search Vela's strategy library by free-text query (name, category, risk, horizon). No auth required.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text query, e.g. "momentum", "mean reversion", "low risk"' },
        limit: { type: 'number', description: 'Max results (1–50, default 10)' },
      },
    },
    handler: async ({ query = '', limit = 10 }) => searchStrategies(String(query), Number(limit) || 10),
  },
  {
    name: 'get_briefing',
    description: '[Phase 1 · public] Deterministic market briefing for a region (us | eu | it | global). Snapshot of major indices and FX — no AI commentary, no cost. No auth required.',
    inputSchema: { type: 'object', properties: { region: { type: 'string', description: 'us | eu | it | global (default: global)' } } },
    handler: async ({ region = 'global' }) => getBriefing(String(region)),
  },
  {
    name: 'get_watchlist',
    description: "[Phase 2 · auth] Return the authenticated user's watchlist.",
    inputSchema: { type: 'object', properties: {} },
    handler: async (_args, { authHeader }) => {
      if (!authHeader) throw new Error('Missing Authorization header');
      const sb = svcClient(authHeader);
      const { data: u } = await sb.auth.getUser();
      if (!u?.user) throw new Error('Invalid token');
      const { data } = await sb.from('watchlist_items').select('symbol, name, created_at').eq('user_id', u.user.id);
      return data ?? [];
    },
  },
  {
    name: 'get_portfolio',
    description: "[Phase 2 · auth] Return the authenticated user's portfolio holdings.",
    inputSchema: { type: 'object', properties: {} },
    handler: async (_args, { authHeader }) => {
      if (!authHeader) throw new Error('Missing Authorization header');
      const sb = svcClient(authHeader);
      const { data: u } = await sb.auth.getUser();
      if (!u?.user) throw new Error('Invalid token');
      const { data } = await sb.from('portfolio_holdings').select('symbol, name, shares, avg_price, currency').eq('user_id', u.user.id);
      return data ?? [];
    },
  },
  {
    name: 'get_news_sentiment',
    description: '[Phase 2 · auth] AI sentiment analysis (news headlines + score) for a ticker. Counted against your Vela plan quota.',
    inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, name: { type: 'string' } }, required: ['symbol'] },
    handler: async ({ symbol, name }, { authHeader }) => callEdge(authHeader ?? `Bearer ${ANON_KEY}`, 'analyze-sentiment', { symbol, name }),
  },
  {
    name: 'scan_opportunities',
    description: '[Phase 2 · auth] Run the Vela AI scanner against a universe (ftse_mib | sp100 | eu_blue).',
    inputSchema: { type: 'object', properties: { universe: { type: 'string' }, criteria: { type: 'string' }, limit: { type: 'number' } } },
    handler: async ({ universe = 'ftse_mib', criteria = '', limit = 10 }, { authHeader }) =>
      callEdge(authHeader ?? `Bearer ${ANON_KEY}`, 'ai-scanner', { universe, criteria, limit }),
  },
  {
    name: 'related_instruments',
    description: '[Phase 2 · auth] Peers, sector ETF and thematic neighbours for a symbol.',
    inputSchema: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] },
    handler: async ({ symbol }, { authHeader }) => callEdge(authHeader ?? `Bearer ${ANON_KEY}`, 'related-instruments', { symbol }),
  },
];

// ── JSON-RPC 2.0 handler (MCP Streamable HTTP) ─────────────────────────
function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result };
}
function rpcError(id: unknown, code: number, message: string, data?: unknown) {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } };
}

async function handleRpc(msg: any, authHeader: string | null) {
  const { id, method, params } = msg ?? {};
  if (method === 'initialize') {
    return rpcResult(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'vela', version: '1.0.0' },
    });
  }
  if (method === 'tools/list') {
    return rpcResult(id, { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
  }
  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments ?? {};
    const tool = tools.find((t) => t.name === name);
    if (!tool) return rpcError(id, -32601, `Unknown tool: ${name}`);
    try {
      const out = await tool.handler(args, { authHeader });
      const text = typeof out === 'string' ? out : JSON.stringify(out);
      return rpcResult(id, { content: [{ type: 'text', text: text.slice(0, 100_000) }], isError: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return rpcResult(id, { content: [{ type: 'text', text: message }], isError: true });
    }
  }
  if (method === 'ping') return rpcResult(id, {});
  if (typeof method === 'string' && method.startsWith('notifications/')) return null; // no response
  return rpcError(id, -32601, `Method not found: ${method}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Simple GET responds with capability summary (helpful for sanity checks).
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({
        name: 'vela',
        version: '1.0.0',
        protocol: 'mcp',
        transport: 'streamable-http',
        tools: tools.map((t) => t.name),
        usage: 'POST JSON-RPC 2.0 with Accept: application/json, text/event-stream',
      }, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify(rpcError(null, -32700, 'Parse error')), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('authorization');
  const responses = Array.isArray(body)
    ? (await Promise.all(body.map((m) => handleRpc(m, authHeader)))).filter((r) => r !== null)
    : await handleRpc(body, authHeader);

  // No content for notifications-only payloads.
  if (responses === null || (Array.isArray(responses) && responses.length === 0)) {
    return new Response(null, { status: 202, headers: corsHeaders });
  }

  return new Response(JSON.stringify(responses), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});