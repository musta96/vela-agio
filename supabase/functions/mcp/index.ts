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
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const j = await r.json();
  const q = j?.quoteResponse?.result?.[0];
  if (!q) return { error: 'symbol not found' };
  return { symbol: q.symbol, name: q.longName ?? q.shortName, price: q.regularMarketPrice, change_pct: q.regularMarketChangePercent, currency: q.currency, exchange: q.fullExchangeName };
}

const app = new Hono();
const server = new McpServer({ name: 'vela', version: '1.0.0' });

server.tool({
  name: 'get_quote',
  description: 'Latest price and basic stats for a Yahoo-style ticker (AAPL, ENI.MI, ASML.AS).',
  inputSchema: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] },
  handler: async ({ symbol }: any) => {
    const data = await getQuote(String(symbol).toUpperCase());
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