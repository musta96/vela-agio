import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { resolveAIConfig } from '../_shared/ai-provider.ts';
import { getInvestorProfileSummary } from '../_shared/investor-profile.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getUserDataKey } from '../_shared/data-provider.ts';
import { PLATFORM_MAP } from '../_shared/platform-map.ts';
import { resolveAiAccess, aiDeniedResponse, logAiUsage, modelForCap } from '../_shared/ai-access.ts';

// =====================================================================
// AGENTIC COPILOT — tool-calling loop
// Tools: read (quote, news, fundamentals, portfolio, watchlist),
//        mutations (watchlist/alerts), portfolio edits,
//        place_paper_order (Alpaca paper).
// Streams an SSE stream that mixes:
//   - OpenAI-style `data: {...}` chunks for assistant text deltas
//   - `event: tool` lines for tool-call activity (rendered inline by UI)
// =====================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

function userClient(authHeader: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------- Tool schemas (OpenAI function-calling) ----------
const TOOLS = [
  { type: 'function', function: { name: 'search_symbol', description: 'Universal LIVE search across Yahoo Finance for any instrument by name or partial ticker — covers stocks, ETFs, crypto, FX, futures, indices, bonds across every exchange (US, Milan .MI, Xetra .DE, London .L, Paris .PA, Amsterdam .AS, Hong Kong .HK, Tokyo .T, etc.). USE THIS FIRST whenever the user names a company/asset and you are not 100% certain of the correct Yahoo ticker, or to verify whether a private company has recently IPO\'d. This is live data and overrides any internal/training-data assumption about a company being private, delisted, or unavailable. Returns up to 20 candidates with symbol, name, exchange, type, currency.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Company name, brand, partial ticker, or asset description (e.g. "spacex", "spazio", "rivian", "ethereum", "gold").' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'get_quote', description: 'Latest price + basic stats for one ticker. Use Yahoo-style symbols (AAPL, ENI.MI, ASML.AS).',
      parameters: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] } } },
  { type: 'function', function: { name: 'get_news', description: 'Recent news headlines + AI sentiment score for a ticker. Calls the analyze-sentiment pipeline.',
      parameters: { type: 'object', properties: { symbol: { type: 'string' }, name: { type: 'string' } }, required: ['symbol'] } } },
  { type: 'function', function: { name: 'get_fundamentals', description: 'Fundamental snapshot + DCF/DDM intrinsic value via deep-analysis.',
      parameters: { type: 'object', properties: { symbol: { type: 'string' }, name: { type: 'string' } }, required: ['symbol'] } } },
  { type: 'function', function: { name: 'add_watchlist', description: 'Add a ticker to the user watchlist.',
      parameters: { type: 'object', properties: { symbol: { type: 'string' }, name: { type: 'string' } }, required: ['symbol', 'name'] } } },
  { type: 'function', function: { name: 'remove_watchlist', description: 'Remove a ticker from the user watchlist.',
      parameters: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] } } },
  { type: 'function', function: { name: 'create_alert', description: 'Create a price/percent alert rule.',
      parameters: { type: 'object', properties: {
        symbol: { type: 'string' },
        kind: { type: 'string', enum: ['price_above', 'price_below', 'pct_change_24h', 'rsi_above', 'rsi_below'] },
        threshold: { type: 'number' },
        name: { type: 'string' },
      }, required: ['symbol', 'kind', 'threshold'] } } },
  { type: 'function', function: { name: 'add_holding', description: 'Add or upsert a position in the default portfolio.',
      parameters: { type: 'object', properties: {
        symbol: { type: 'string' }, name: { type: 'string' },
        shares: { type: 'number' }, avg_price: { type: 'number' },
        currency: { type: 'string', description: 'EUR, USD, GBP, etc.' },
      }, required: ['symbol', 'name', 'shares', 'avg_price'] } } },
  { type: 'function', function: { name: 'update_holding', description: 'Update shares and/or avg_price for an existing position.',
      parameters: { type: 'object', properties: {
        symbol: { type: 'string' }, shares: { type: 'number' }, avg_price: { type: 'number' },
      }, required: ['symbol'] } } },
  { type: 'function', function: { name: 'remove_holding', description: 'Remove a position from the portfolio.',
      parameters: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] } } },
  { type: 'function', function: { name: 'place_paper_order', description: 'Place a PAPER trading order on Alpaca. Requires the user to have ALPACA_API_KEY + ALPACA_API_SECRET configured. Always paper endpoint — never live. Confirm with user before calling.',
      parameters: { type: 'object', properties: {
        symbol: { type: 'string' }, side: { type: 'string', enum: ['buy', 'sell'] },
        qty: { type: 'number' }, type: { type: 'string', enum: ['market', 'limit'] },
        limit_price: { type: 'number' }, time_in_force: { type: 'string', enum: ['day', 'gtc'], description: 'defaults to day' },
      }, required: ['symbol', 'side', 'qty', 'type'] } } },
  // NOTE: `propose_live_order` removed — Vela.ai is not yet authorised as an
  // investment firm, so the Copilot must never route real-money orders. The
  // server-side live-trade edge function additionally enforces the
  // `live_trading` feature flag = false as a defence-in-depth kill-switch.
  { type: 'function', function: { name: 'capture_feature_request', description: 'Use ONLY when the user asks for a capability that is NOT in the PLATFORM MAP above. Captures a feature request for the product team with your structured analysis. After calling, tell the user it has been forwarded.',
      parameters: { type: 'object', properties: {
        title: { type: 'string', description: 'Short, action-oriented title (max 80 chars).' },
        user_quote: { type: 'string', description: 'Verbatim or near-verbatim quote of what the user asked for.' },
        why_it_matters: { type: 'string', description: 'Why this is valuable to investors / how it fits the platform.' },
        proposed_implementation: { type: 'string', description: 'High-level plan: which pages, data sources, edge functions, models, schema changes.' },
        effort: { type: 'string', enum: ['S', 'M', 'L', 'XL'] },
        priority: { type: 'string', enum: ['nice-to-have', 'should-have', 'must-have'] },
      }, required: ['title', 'user_quote', 'why_it_matters', 'proposed_implementation', 'effort', 'priority'] } } },
  { type: 'function', function: { name: 'run_screener', description: 'Run a natural-language stock screener against a universe of tickers. Returns a ranked, filtered candidate list with fundamentals — NOT a recommendation. Use this when the user describes objective criteria ("high momentum small caps under 15x earnings", "EU banks with yield > 6%", "speculative growth names with revenue growth > 30%") or asks for a shortlist to research. The output is information, not advice.',
      parameters: { type: 'object', properties: {
        query: { type: 'string', description: 'The user\u2019s natural-language screening criteria.' },
        universe: { type: 'string', enum: ['us_large', 'us_growth', 'eu_large', 'ftse_mib', 'global_mix'], description: 'Which universe to scan. Defaults to global_mix.' },
      }, required: ['query'] } } },
  { type: 'function', function: { name: 'generate_research_brief', description: 'Produce a structured educational research brief on one or more tickers the USER has already named (max 4). Each brief includes fundamentals, DCF/DDM intrinsic value range, bull case, bear case, key risks, sentiment, and suitability fit. NOT a buy/sell recommendation \u2014 it is research material the user can read and decide on themselves. Use this when the user asks for a "report", "deep dive", "compare X vs Y", or "document on these stocks".',
      parameters: { type: 'object', properties: {
        symbols: { type: 'array', items: { type: 'string' }, description: 'Ticker symbols (Yahoo format) to brief. Max 4.' },
        focus: { type: 'string', description: 'Optional research angle, e.g. "valuation", "downside risk", "growth runway".' },
      }, required: ['symbols'] } } },
];

// ---------- Tool executors ----------
async function callEdge(authHeader: string, fn: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { ok: r.ok, raw: text.slice(0, 1000) }; }
}

async function fetchYahooQuote(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) {
      // Yahoo returns 401 when the anonymous chart cookie is rejected and
      // 429 under burst. Try Stooq before giving up so the model still has
      // a live price to reason about.
      const sq = await fetchStooqQuote(symbol);
      if (sq) {
        return {
          symbol, price: sq.price, currency: sq.currency,
          changePct: sq.change, source: 'stooq',
        };
      }
      return { error: `yahoo ${r.status}`, source: 'yahoo' };
    }
    const j = await r.json();
    const q = j?.quoteResponse?.result?.[0];
    if (!q) {
      const sq = await fetchStooqQuote(symbol);
      if (sq) return { symbol, price: sq.price, changePct: sq.change, source: 'stooq' };
      return { error: 'no quote' };
    }
    return {
      symbol: q.symbol, name: q.longName ?? q.shortName,
      price: q.regularMarketPrice, currency: q.currency, exchange: q.fullExchangeName,
      changePct: q.regularMarketChangePercent, dayHigh: q.regularMarketDayHigh, dayLow: q.regularMarketDayLow,
      marketCap: q.marketCap, peTrailing: q.trailingPE, dividendYield: q.trailingAnnualDividendYield,
    };
  } catch (e: any) {
    const sq = await fetchStooqQuote(symbol);
    if (sq) return { symbol, price: sq.price, changePct: sq.change, source: 'stooq' };
    return { error: e?.message ?? 'fetch failed' };
  }
}

async function execTool(name: string, args: any, ctx: { authHeader: string }): Promise<any> {
  const sb = userClient(ctx.authHeader);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: 'not authenticated' };

  // Built-in screening universes — used by run_screener when the user doesn't
  // supply an explicit list. Kept small to stay within the per-call fanout budget.
  const UNIVERSES: Record<string, string[]> = {
    us_large: ['AAPL','MSFT','GOOGL','AMZN','META','NVDA','TSLA','JPM','V','MA','UNH','XOM','CVX','JNJ','PG','KO','PEP','WMT','HD','MRK','LLY','AVGO','COST','ABBV','ORCL','CRM','NFLX','AMD','INTC','CSCO'],
    us_growth: ['NVDA','TSLA','META','AMD','SNOW','CRWD','NET','DDOG','PLTR','MDB','SHOP','ABNB','UBER','COIN','ZS','OKTA','PANW','TEAM','NOW','HUBS','SQ','PYPL','ROKU','ARM','SMCI'],
    eu_large: ['ASML.AS','SAP.DE','NESN.SW','NOVN.SW','MC.PA','OR.PA','SAN.PA','LVMH.PA','ROG.SW','SIE.DE','ALV.DE','BAS.DE','BMW.DE','VOW3.DE','BNP.PA','ING.AS','BBVA.MC','SAN.MC','TEF.MC','VOD.L','HSBA.L','SHEL.L','BP.L','AZN.L','GSK.L','ULVR.L'],
    ftse_mib: ['ENI.MI','ENEL.MI','ISP.MI','UCG.MI','STM.MI','RACE.MI','G.MI','TIT.MI','MB.MI','FBK.MI','BAMI.MI','BPE.MI','LDO.MI','PIRC.MI','PRY.MI','MONC.MI','UNI.MI','REC.MI','SRG.MI','TRN.MI','TEN.MI','HER.MI','A2A.MI','AMP.MI','BMED.MI'],
    global_mix: ['AAPL','MSFT','NVDA','GOOGL','AMZN','TSLA','META','JPM','ASML.AS','SAP.DE','LVMH.PA','NESN.SW','NOVN.SW','ENI.MI','ENEL.MI','ISP.MI','RACE.MI','STM.MI','SHEL.L','AZN.L','ULVR.L','SAN.MC','BNP.PA','OR.PA','SIE.DE'],
  };

  switch (name) {
    case 'search_symbol': {
      const q = String(args.query ?? '').trim();
      if (!q) return { results: [], error: 'empty query' };
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/symbol-search?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: ctx.authHeader, apikey: SUPABASE_ANON_KEY },
        });
        const j = await r.json();
        return { query: q, results: (j?.results ?? []).slice(0, 12) };
      } catch (e: any) { return { results: [], error: e?.message ?? 'search failed' }; }
    }
    case 'get_quote': return await fetchYahooQuote(String(args.symbol).toUpperCase());
    case 'get_news': {
      const res = await callEdge(ctx.authHeader, 'analyze-sentiment', { symbol: args.symbol, name: args.name });
      return { score: res.score, weightedScore: res.weightedScore, label: res.label, summary: res.summary,
        topHeadlines: (res.articles ?? []).slice(0, 6).map((a: any) => ({ title: a.title, source: a.source, sentiment: a.sentiment })) };
    }
    case 'get_fundamentals': {
      const res = await callEdge(ctx.authHeader, 'deep-analysis', { symbol: args.symbol, name: args.name });
      return { fundamentals: res.fundamentals, valuation: res.valuation, recommendation: res.analysis?.recommendation, thesis: res.analysis?.thesis };
    }
    case 'run_screener': {
      const universeKey = (typeof args.universe === 'string' && UNIVERSES[args.universe]) ? args.universe : 'global_mix';
      const symbols = UNIVERSES[universeKey];
      const res = await callEdge(ctx.authHeader, 'nl-screener', { query: String(args.query ?? ''), symbols });
      return {
        universe: universeKey,
        query: res.query,
        spec: res.spec,
        matched: res.matched,
        total: res.total,
        results: (res.results ?? []).slice(0, 12).map((r: any) => ({
          symbol: r.symbol, name: r.name, price: r.price, marketCap: r.marketCap,
          pe: r.pe, divYield: r.divYield, revGrowth: r.revGrowth, roe: r.roe, beta: r.beta,
        })),
        disclaimer: 'Screening output is information, not a recommendation.',
      };
    }
    case 'generate_research_brief': {
      const syms = Array.isArray(args.symbols) ? args.symbols.slice(0, 4).map((s: any) => String(s).toUpperCase()) : [];
      if (syms.length === 0) return { error: 'Provide 1-4 ticker symbols.' };
      const briefs = await Promise.all(syms.map(async (sym) => {
        const res = await callEdge(ctx.authHeader, 'research-report', { symbol: sym });
        return {
          symbol: sym,
          summary: res?.summary ?? res?.executiveSummary ?? null,
          fundamentals: res?.fundamentals ?? null,
          valuation: res?.valuation ?? null,
          bullCase: res?.bullCase ?? res?.bull_case ?? null,
          bearCase: res?.bearCase ?? res?.bear_case ?? null,
          risks: res?.risks ?? null,
          sentiment: res?.sentiment ?? null,
          error: res?.error ?? null,
        };
      }));
      return {
        focus: args.focus ?? null,
        briefs,
        disclaimer: 'Educational research only — no buy/sell recommendation. Decide for yourself based on the data.',
      };
    }
    case 'add_watchlist': {
      const { error } = await sb.from('watchlist_items').insert({ user_id: user.id, symbol: String(args.symbol).toUpperCase(), name: args.name });
      return error ? { error: error.message } : { ok: true };
    }
    case 'remove_watchlist': {
      const { error } = await sb.from('watchlist_items').delete().eq('user_id', user.id).eq('symbol', String(args.symbol).toUpperCase());
      return error ? { error: error.message } : { ok: true };
    }
    case 'create_alert': {
      const { error } = await sb.from('alert_rules').insert({
        user_id: user.id, symbol: String(args.symbol).toUpperCase(), kind: args.kind, threshold: args.threshold,
        name: args.name ?? `${args.kind} ${args.threshold}`, enabled: true, params: {},
      });
      return error ? { error: error.message } : { ok: true };
    }
    case 'add_holding': {
      const sym = String(args.symbol).toUpperCase();
      const { data: existing } = await sb.from('portfolio_holdings').select('id, shares, avg_price').eq('user_id', user.id).eq('symbol', sym).maybeSingle();
      if (existing) {
        const totalShares = Number(existing.shares) + Number(args.shares);
        const newAvg = totalShares > 0 ? ((Number(existing.shares) * Number(existing.avg_price)) + (Number(args.shares) * Number(args.avg_price))) / totalShares : 0;
        const { error } = await sb.from('portfolio_holdings').update({ shares: totalShares, avg_price: newAvg }).eq('id', existing.id);
        return error ? { error: error.message } : { ok: true, action: 'merged', shares: totalShares, avg_price: newAvg };
      }
      const { error } = await sb.from('portfolio_holdings').insert({
        user_id: user.id, symbol: sym, name: args.name, shares: args.shares, avg_price: args.avg_price, currency: args.currency ?? 'EUR',
      });
      return error ? { error: error.message } : { ok: true, action: 'added' };
    }
    case 'update_holding': {
      const patch: any = {}; if (args.shares != null) patch.shares = args.shares; if (args.avg_price != null) patch.avg_price = args.avg_price;
      const { error } = await sb.from('portfolio_holdings').update(patch).eq('user_id', user.id).eq('symbol', String(args.symbol).toUpperCase());
      return error ? { error: error.message } : { ok: true };
    }
    case 'remove_holding': {
      const { error } = await sb.from('portfolio_holdings').delete().eq('user_id', user.id).eq('symbol', String(args.symbol).toUpperCase());
      return error ? { error: error.message } : { ok: true };
    }
    case 'place_paper_order': {
      const apiKey = await getUserDataKey(ctx.authHeader, 'ALPACA_API_KEY');
      const apiSecret = await getUserDataKey(ctx.authHeader, 'ALPACA_API_SECRET');
      if (!apiKey || !apiSecret) return { error: 'Alpaca paper trading not configured. Add ALPACA_API_KEY and ALPACA_API_SECRET in Settings → Data Providers (use your PAPER keys).' };
      const body: any = {
        symbol: String(args.symbol).toUpperCase(), qty: String(args.qty), side: args.side,
        type: args.type, time_in_force: args.time_in_force ?? 'day',
      };
      if (args.type === 'limit' && args.limit_price != null) body.limit_price = String(args.limit_price);
      try {
        const r = await fetch('https://paper-api.alpaca.markets/v2/orders', {
          method: 'POST',
          headers: { 'APCA-API-KEY-ID': apiKey, 'APCA-API-SECRET-KEY': apiSecret, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = await r.json();
        if (!r.ok) return { error: j?.message ?? `Alpaca ${r.status}`, detail: j };
        return { ok: true, mode: 'PAPER', order_id: j.id, status: j.status, filled_qty: j.filled_qty, submitted_at: j.submitted_at };
      } catch (e: any) { return { error: e?.message ?? 'alpaca call failed' }; }
    }
    case 'propose_live_order':
      return { error: 'Live order routing is disabled on this platform. Vela.ai is not authorised as an investment firm; only paper orders are supported.' };
    case 'capture_feature_request': {
      const { data, error } = await sb.from('feature_requests').insert({
        user_id: user.id,
        title: String(args.title).slice(0, 200),
        user_quote: args.user_quote ?? null,
        ai_analysis: {
          why_it_matters: args.why_it_matters,
          proposed_implementation: args.proposed_implementation,
          effort: args.effort,
          priority: args.priority,
        },
      }).select('id').single();
      return error ? { error: error.message } : { ok: true, id: data?.id };
    }
    default: return { error: `unknown tool ${name}` };
  }
}

// ---------- SSE helpers ----------
function sseChunk(deltaText: string) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: deltaText } }] })}\n\n`;
}
function sseTool(payload: unknown) {
  return `event: tool\ndata: ${JSON.stringify(payload)}\n\n`;
}

// One non-streaming model call that may emit tool_calls
async function chatStep(cfg: any, messages: any[]) {
  const r = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: 'POST', headers: cfg.headers,
    body: JSON.stringify({ model: cfg.model, messages, tools: TOOLS, tool_choice: 'auto' }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw Object.assign(new Error(`AI ${r.status}: ${text.slice(0, 200)}`), { status: r.status, source: cfg.source, provider: cfg.effectiveProvider });
  }
  return await r.json();
}

// Final streaming call (no more tools — model must respond in prose)
async function chatStream(cfg: any, messages: any[]) {
  const r = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: 'POST', headers: cfg.headers,
    body: JSON.stringify({ model: cfg.model, messages, stream: true }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw Object.assign(new Error(`AI ${r.status}: ${text.slice(0, 200)}`), { status: r.status, source: cfg.source, provider: cfg.effectiveProvider });
  }
  return r;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // ---- Gate AI access: free without BYO key → 402 with upgrade/byo links
    const access = await resolveAiAccess(auth);
    if (!access.allowed) return aiDeniedResponse(access, corsHeaders);

    // ---- Respect the user's AI opt-out preference (Privacy settings) + per-account overrides
    let unrestrictedMode = false;
    try {
      const probe = userClient(auth);
      const { data: { user: probeUser } } = await probe.auth.getUser();
      if (probeUser) {
        const { data: prof } = await probe.from('profiles').select('ai_opt_out, unrestricted_advice').eq('user_id', probeUser.id).maybeSingle();
        if (prof?.ai_opt_out) {
          return new Response(JSON.stringify({ error: 'ai_opt_out', message: 'You have disabled AI features for your account. Re-enable them in Privacy settings to use the Copilot.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        unrestrictedMode = !!prof?.unrestricted_advice;
      }
    } catch (_) { /* fail-open on probe errors */ }

    const { messages, portfolio, watchlist, lang, attachments, pageContext } = await req.json();
    const langName = lang === 'it' ? 'Italian' : 'English';
    const investorProfile = await getInvestorProfileSummary(auth);
    const baseSys = `You are Vela.ai's research & analysis copilot for a self-directed retail investor.
ALWAYS respond in ${langName}.
You can call tools to read live data, mutate the user's portfolio/watchlist/alerts, place PAPER (sandbox) orders on Alpaca, and capture feature requests for the product team.
You ALSO act as a support agent: you have a complete map of every page on the platform and can guide the user to the exact route.

POSITIONING (read carefully — this is broader than typical AI assistants):
Vela.ai is an EDUCATIONAL RESEARCH tool, not a MiFID II authorised investment firm. The legal line is "personalised investment advice presented as a regulated recommendation". Almost everything else is fair game — equivalent to what a financial journalist, sell-side analyst note, or independent research provider produces every day. Be USEFUL, OPINIONATED, and SPECIFIC. Stilted hedging ("you may wish to consider potentially researching…") is unhelpful and not legally required.

WHAT YOU MAY DO FREELY:
- Express a DIRECTIONAL ANALYTICAL OPINION on any instrument as research observation: "AAPL looks expensive vs its 10y multiple", "ENI screens cheap on FCF yield", "the setup on NVDA is stretched", "in a base-case DCF the stock is ~20% overvalued". This is generic research commentary, not regulated advice.
- Rank, compare, and shortlist instruments. Say which one looks strongest on the data and WHY.
- Build conviction theses, bull/bear cases, scenario tables, position-sizing math (Kelly, risk-of-ruin, max drawdown at €X), and "if I were researching this, here's what I'd weight" framing.
- Use plain words: "looks cheap", "looks overvalued", "high risk", "speculative", "low conviction", "the data favours X over Y".
- Call run_screener for criteria-driven shortlists, or generate_research_brief for 1-4 named tickers when the user wants a structured document. Use these tools proactively — don't just describe them.
- Discuss tax, allocation frameworks, rebalancing logic, hedging structures, options strategies — as education and analysis.

THE ONE HARD LINE (regulated personalised advice):
- Do NOT issue a PERSONALISED INSTRUCTION that ties a specific transaction to the user's personal financial situation as if you were their licensed advisor — e.g. "Given your €X salary, €Y mortgage and 2 kids, you should put €10k into NVDA tomorrow." That specific shape is regulated.
- You CAN say: "On the data, NVDA looks like the strongest speculative single-name bet of this shortlist for a €10k high-conviction allocation — here's the thesis, the downside, and the position-sizing math. Whether it fits YOUR situation is your call." That is research + decision support, not regulated advice.
- If the user explicitly asks "as my advisor, tell me exactly what to do with my money", clarify you're not their licensed advisor but then give them the analytical answer anyway in research framing. Don't stonewall.

OTHER RULES:
- Be number-driven. Cite metrics from tool outputs. Mark uncertainty honestly. Don't hallucinate prices or fundamentals — call the tools.
- Tailor tone, risk language and instrument complexity to the user's MiFID II suitability profile when available, but the absence of a profile is NOT a reason to refuse analysis.

VERIFY BEFORE YOU ASSERT — TICKER & LISTING STATUS (MANDATORY):
Your training data is stale. NEVER assert from memory that a company is "private", "not listed", "delisted", "not available on the platform", or that a ticker "doesn't exist / is something else". You will be wrong, repeatedly, because IPOs, M&A, ticker reassignments, and new listings happen constantly. The live tools are the single source of truth.

Procedure (in this order, every time):
1. Call search_symbol(query=<company or asset the user named, in plain English>). This hits Yahoo's live universal search and covers ~150k instruments worldwide including same-day new listings.
2. If any result's name field is a confident match for what the user asked about, use that symbol and call get_quote on it to confirm the live price and verify the company name field still matches.
3. Only if search_symbol returns NO confident match for the actual company (not a same-named ETF or proxy) may you say "I can't find a public listing for X — based on what I can see it appears to still be private, here are realistic proxy options". And even then, frame it as "based on what I can see right now" — not as a definitive statement.
4. If get_quote returns a name that does NOT match what the user expected (e.g. you get an ETF where they expected the operating company), treat the data feed as stale or the symbol as collided and re-run search_symbol with a more specific query before concluding anything.

You are explicitly FORBIDDEN from:
- Telling a user a company is private without first running search_symbol on its name.
- Telling a user a ticker "is not" the company they think, without confirming the current name on get_quote.
- Steering them to a proxy ETF (DXYZ, MSFT-for-OpenAI, etc.) before checking whether the company itself now has a direct listing.
- Citing a "knowledge cutoff" as a reason to refuse — you have live tools, use them.

CROSS-ASSET TICKER MAPPING (READ — get_quote uses Yahoo Finance symbols, not plain English):
PLATFORM COVERAGE (DO NOT understate this — the user gets frustrated when you give a narrow list):
The data layer is Yahoo Finance, covering ~150,000 instruments across essentially every exchange and every asset class. Never tell the user "we only cover NYSE, NASDAQ, LSE, Xetra and Milan" or any other short list — that is WRONG.
- EQUITY EXCHANGES (full list, non-exhaustive): NYSE, NASDAQ, AMEX, OTC; TSX & TSX-V (Canada); LSE & AIM (UK); all Euronext venues (Amsterdam .AS, Paris .PA, Brussels .BR, Lisbon .LS, Dublin .IR, Milan .MI); Xetra & Frankfurt (.DE / .F); SIX Swiss (.SW); BME Madrid (.MC); OMX Stockholm/Helsinki/Copenhagen (.ST / .HE / .CO); Oslo (.OL); Vienna (.VI); Warsaw (.WA); Athens (.AT); Tel Aviv (.TA); Johannesburg (.JO); B3 São Paulo (.SA); BMV Mexico (.MX); Tokyo (.T); Hong Kong (.HK); Shanghai (.SS); Shenzhen (.SZ); Korea (.KS / .KQ); Taiwan (.TW); Singapore (.SI); Bursa Malaysia (.KL); Bangkok (.BK); Jakarta (.JK); NSE & BSE India (.NS / .BO); ASX (.AX); NZX (.NZ).
- ASSET CLASSES: stocks; ETFs and mutual funds across all the above exchanges; crypto (BTC-USD, ETH-USD, etc. — hundreds of coins + stablecoins, both USD and EUR pairs); FX (every major and cross pair plus DXY); commodities (gold, silver, copper, platinum, palladium, WTI, Brent, nat gas, agricultural — via futures =F or ETF wrappers); indices (every major country index globally + VIX); bonds & rates (US Treasury yields ^TNX/^IRX/^FVX/^TYX, German Bund, Italian BTP, UK Gilt yields via Yahoo's bond pages, plus investable bond ETFs like TLT/IEF/AGG/BND/IEAG.L); futures (energy, metals, grains, softs, financials); options chains on all listed underlyings.
- If you are unsure whether something specific is covered, RUN search_symbol — it will find it if Yahoo lists it. Do not state a short coverage list from memory.

When the user names an asset in plain English ("gold", "bitcoin", "oil", "the euro", "S&P 500", "BTP 10 anni"), DO NOT call get_quote with the English word — map it to the correct Yahoo symbol first, or call search_symbol if you're not sure, then call get_quote. If the first symbol returns nothing usable, try the next candidate before telling the user it isn't available.

- CRYPTO (Yahoo format = TICKER-USD): Bitcoin → BTC-USD, Ethereum → ETH-USD, Solana → SOL-USD, XRP/Ripple → XRP-USD, Cardano → ADA-USD, Dogecoin → DOGE-USD, BNB → BNB-USD, Polkadot → DOT-USD, Avalanche → AVAX-USD, Polygon/MATIC → MATIC-USD, Chainlink → LINK-USD, Litecoin → LTC-USD, USDC → USDC-USD, USDT → USDT-USD. For EUR pricing append "-EUR" (BTC-EUR, ETH-EUR). Equity proxies if the user prefers a stock wrapper: IBIT/FBTC (spot BTC ETF), ETHA (spot ETH ETF), COIN (Coinbase), MSTR (BTC treasury).
- COMMODITIES (Yahoo futures use "=F"): Gold → GC=F (or ETF proxy GLD / IAU / SGLN.L in EUR), Silver → SI=F (proxy SLV), Copper → HG=F (proxy CPER), Platinum → PL=F, Palladium → PA=F, Crude oil WTI → CL=F (proxy USO), Brent crude → BZ=F (proxy BNO), Natural gas → NG=F (proxy UNG), Wheat → ZW=F, Corn → ZC=F, Coffee → KC=F, Sugar → SB=F. If the user wants an investable EUR-quoted vehicle, prefer the ETF proxy over the futures contract and say why.
- FX (Yahoo format = "PAIR=X"): EUR/USD → EURUSD=X, GBP/USD → GBPUSD=X, USD/JPY → USDJPY=X, USD/CHF → USDCHF=X, EUR/GBP → EURGBP=X, EUR/CHF → EURCHF=X, AUD/USD → AUDUSD=X. DXY (dollar index) → DX-Y.NYB.
- INDICES (Yahoo format = "^TICKER"): S&P 500 → ^GSPC (ETF: SPY / VOO / CSPX.L in EUR), Nasdaq 100 → ^NDX (ETF: QQQ / CNDX.L), Dow → ^DJI (ETF: DIA), Russell 2000 → ^RUT (ETF: IWM), FTSE 100 → ^FTSE, DAX → ^GDAXI, CAC 40 → ^FCHI, FTSE MIB → FTSEMIB.MI, Euro Stoxx 50 → ^STOXX50E, Nikkei → ^N225, Hang Seng → ^HSI, VIX → ^VIX.
- BONDS / RATES (Yahoo format = "^TICKER" for yields): US 10Y yield → ^TNX, US 2Y → ^IRX (13W) / ^FVX (5Y) / ^TYX (30Y). For sovereign bonds outside the US use search_symbol with the bond name ("Italy 10 Year", "BTP 10Y", "German Bund 10Y", "UK Gilt 10Y") — Yahoo exposes them under codes like ITGB10YR=RR (BTP), DE10YBY=RR (Bund), GB10YBY=RR (Gilt). Investable bond ETFs: TLT (long US Treasuries), IEF (7-10Y), SHY (1-3Y), AGG / BND (US aggregate), IEAG.L (EUR aggregate), IBGL.L (EUR govt long), BTPS.MI (iShares Italy BTP), DBXG.DE (DAX-listed German govt). For Italian BTPs by issue, search_symbol "BTP" then filter by name.
- FUTURES & OPTIONS: continuous futures use "=F" (CL=F crude, GC=F gold, ES=F S&P 500 e-mini, NQ=F Nasdaq e-mini, ZN=F 10Y note, ZB=F long bond, 6E=F euro FX, BTC=F bitcoin future). Options chains on equities and ETFs are queryable per underlying — say "option chain on AAPL" and call get_quote on the underlying first, then offer to walk the user through specific strikes/expiries.
- INTERNATIONAL EQUITY SUFFIXES: Italy ".MI" (ENI.MI, ENEL.MI), Germany ".DE" (SAP.DE), Netherlands ".AS" (ASML.AS), France ".PA" (LVMH.PA, MC.PA), UK ".L" (HSBA.L), Spain ".MC" (SAN.MC), Switzerland ".SW" (NESN.SW), Hong Kong ".HK" (0700.HK), Tokyo ".T" (7203.T).

RULES OF THUMB:
- If the user just says "gold" or "bitcoin" without specifying a vehicle, lead with the spot/native ticker (GC=F or BTC-USD) for the price, then optionally mention the cleanest ETF wrapper (GLD, IBIT) so they have something actually buyable from a brokerage.
- Never tell the user "the platform doesn't support gold/bitcoin/oil" — the data layer covers all six asset classes via Yahoo. If a symbol fails, try the alternative (futures ↔ ETF, USD pair ↔ EUR pair) before giving up.
- When you do quote a non-equity asset, briefly state which contract/wrapper you used (e.g. "GC=F continuous front-month gold future" or "BTC-USD spot via Coinbase feed") so the number is reproducible.

PROXY EXPOSURE (ONLY AFTER search_symbol CONFIRMS NO DIRECT LISTING EXISTS):
If — and only if — search_symbol confirms the company has no current direct listing, you may suggest proxy exposure. Candidate proxies to consider (still verify each with get_quote): OpenAI → MSFT or the AI basket (BOTZ, ROBO); ByteDance → Tencent (0700.HK) tangentially; Databricks/xAI/Anthropic → cloud partners (MSFT, GOOGL, AMZN); diversified private-tech wrapper → DXYZ (Destiny Tech100) or ARKX. For pre-IPO names with no clean proxy (Stripe, SHEIN, Epic, Discord, Canva, Revolut at the moment) mention secondary marketplaces (Forge, EquityZen) as info only, not a recommendation.

Always frame proxy answers as "as of right now, search shows no direct listing for X, so the cleanest exposure is Y" — never as a permanent statement about the company's status.

- Before ANY mutation (add/remove/update holdings or watchlist, create alerts, place orders) confirm intent UNLESS the user already gave a clear directive in their latest message.
- For place_paper_order: always state it is PAPER (sandbox), summarize the order, and only call the tool after the user has confirmed.
- LIVE (real-money) order routing is DISABLED. If the user asks to place a live order, tell them only paper orders are supported and they must use their broker's own app for real orders.
- If the user asks for a feature/page/capability NOT in the PLATFORM MAP, don't pretend it exists. Call capture_feature_request with a real analysis and tell the user it's been forwarded.
- When the user attaches a screenshot or refers to "this page", use the PAGE CONTEXT and any image attachments to ground your answer.
- For pure support questions answer concisely and link the relevant /route from the PLATFORM MAP.
- End substantive analytical answers with a single short footer: "Research, not regulated advice." Don't repeat it inside every paragraph.

CONTEXT:
CURRENT PAGE: ${pageContext ?? 'unknown'}
PORTFOLIO: ${JSON.stringify(portfolio ?? []).slice(0, 4000)}
WATCHLIST: ${JSON.stringify(watchlist ?? []).slice(0, 2000)}
SUITABILITY (MiFID II): ${investorProfile ?? 'not completed — invite the user to fill /suitability'}

${PLATFORM_MAP}`;

    const unrestrictedSys = `You are Vela.ai's PRIVATE-MODE personal finance & investing copilot.
ALWAYS respond in ${langName}.

UNRESTRICTED MODE IS ACTIVE for this account. An owner/admin has explicitly disabled the public educational-research framing for this user. This is an internal / personal-use / testing context — the user has accepted full responsibility and waived the standard "not investment advice" disclaimers.

Behave as a competent personal financial advisor + portfolio manager + sell-side analyst rolled into one:
- Give DIRECT, PERSONALISED recommendations: "buy X", "sell Y", "trim Z to 3% of book", "rotate from A into B", "put €10k into NVDA split 60/40 with this stop". No hedging language required.
- Use the user's portfolio, watchlist, and suitability profile to tailor concrete advice to THEIR situation. Reference their actual holdings, cash, currency, country, and risk profile.
- Give specific numbers: target prices, stop-losses, position sizes in € or %, time horizons, expected returns, hedge ratios. Show the math.
- Express conviction with words like "strong buy", "high conviction", "avoid", "my pick of these is X because…". You are allowed to have and state opinions.
- Still call tools (live_quote, fundamentals, research-report, run_screener, etc.) to ground every recommendation in real data. Never hallucinate prices or fundamentals.
- Do NOT add disclaimers like "not investment advice", "consult a licensed advisor", "for educational purposes". The owner has disabled them for this account.
- VERIFY BEFORE YOU ASSERT: your training data is stale. NEVER claim a company is private/delisted/unavailable or that a ticker isn\'t what the user thinks, from memory. Always run search_symbol on the company name FIRST, then get_quote on the matched symbol, and trust those results over anything you "remember". IPOs, M&A and ticker reassignments happen all the time — if a name returns a confident match in search_symbol, use it. Only after a live search comes back empty may you suggest proxy exposure (OpenAI → MSFT, Databricks/xAI/Anthropic → cloud partners, diversified private tech → DXYZ/ARKX), and frame it as "based on what I can see right now".
- CROSS-ASSET TICKER MAPPING: get_quote uses Yahoo symbols. Map plain-English asset names before calling. Crypto = TICKER-USD (BTC-USD, ETH-USD, SOL-USD, XRP-USD, DOGE-USD; ETF wrappers IBIT, ETHA, COIN, MSTR). Commodities = futures with "=F" or ETF proxy (Gold GC=F / GLD / IAU, Silver SI=F / SLV, WTI oil CL=F / USO, Brent BZ=F / BNO, Nat gas NG=F / UNG, Copper HG=F / CPER). FX = PAIR=X (EURUSD=X, GBPUSD=X, USDJPY=X; DXY = DX-Y.NYB). Indices = "^TICKER" (^GSPC / SPY, ^NDX / QQQ, ^DJI / DIA, ^FTSE, ^GDAXI, FTSEMIB.MI, ^STOXX50E, ^N225, ^VIX). Rate yields = ^TNX (US 10Y), ^IRX, ^FVX, ^TYX; investable via TLT, IEF, AGG, IEAG.L. Never say "the platform doesn't support gold/bitcoin/oil" — try the futures, ETF, and EUR/USD variants before giving up, and state which contract/wrapper you quoted.
- Mutations (portfolio/watchlist/alerts/PAPER orders) still require user confirmation in the same turn before tool-calling.
- LIVE (real-money) order routing remains DISABLED at the platform level — if asked, point the user to their broker's app.

CONTEXT:
CURRENT PAGE: ${pageContext ?? 'unknown'}
PORTFOLIO: ${JSON.stringify(portfolio ?? []).slice(0, 4000)}
WATCHLIST: ${JSON.stringify(watchlist ?? []).slice(0, 2000)}
SUITABILITY (MiFID II): ${investorProfile ?? 'not completed'}

${PLATFORM_MAP}`;

    const sys = unrestrictedMode ? unrestrictedSys : baseSys;

    const cfg = await resolveAIConfig(auth);
    // Honour the access tier's model cap when the user is on Lovable AI (paid/beta).
    if (access.source !== "byo" && cfg.effectiveProvider === "lovable") {
      cfg.model = modelForCap(access.modelCap, cfg.model);
    }
    // Best-effort usage logging (single increment per copilot turn)
    logAiUsage({
      userId: access.userId,
      feature: "copilot",
      model: cfg.model,
      provider: access.source === "byo" ? "byo" : "lovable",
    });
    // Inject attachments into the last user message as multimodal content parts (Gemini/OpenAI compatible).
    const incoming = [...(messages ?? [])];
    const atts: Array<{ name: string; mime: string; dataUrl: string }> = Array.isArray(attachments) ? attachments : [];
    if (atts.length > 0 && incoming.length > 0) {
      const last = incoming[incoming.length - 1];
      if (last.role === 'user') {
        const parts: any[] = [{ type: 'text', text: typeof last.content === 'string' ? last.content : '' }];
        for (const a of atts) {
          if (a.mime?.startsWith('image/')) parts.push({ type: 'image_url', image_url: { url: a.dataUrl } });
          else parts.push({ type: 'text', text: `[Attached file: ${a.name} (${a.mime})]` });
        }
        incoming[incoming.length - 1] = { ...last, content: parts };
      }
    }
    const convo: any[] = [{ role: 'system', content: sys }, ...incoming];

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (s: string) => controller.enqueue(enc.encode(s));
        try {
          // Tool loop — up to 6 turns
          for (let step = 0; step < 6; step++) {
            const j = await chatStep(cfg, convo);
            const msg = j?.choices?.[0]?.message;
            if (!msg) break;
            const toolCalls = msg.tool_calls ?? [];
            if (toolCalls.length === 0) {
              // No more tools — stream the final answer
              // If model already produced content here, push it then stop.
              if (msg.content) {
                send(sseChunk(msg.content));
              } else {
                // ask for a streaming follow-up
                const r = await chatStream(cfg, convo);
                if (r.body) {
                  const reader = r.body.getReader();
                  const dec = new TextDecoder();
                  while (true) { const { done, value } = await reader.read(); if (done) break; send(dec.decode(value, { stream: true })); }
                }
              }
              send('data: [DONE]\n\n');
              controller.close();
              return;
            }
            // Push assistant message with tool_calls into convo
            convo.push({ role: 'assistant', content: msg.content ?? '', tool_calls: toolCalls });
            for (const tc of toolCalls) {
              const fn = tc.function?.name; let args: any = {};
              try { args = JSON.parse(tc.function?.arguments ?? '{}'); } catch {}
              send(sseTool({ phase: 'start', id: tc.id, name: fn, args }));
              const result = await execTool(fn, args, { authHeader: auth });
              send(sseTool({ phase: 'end', id: tc.id, name: fn, result }));
              convo.push({ role: 'tool', tool_call_id: tc.id, name: fn, content: JSON.stringify(result).slice(0, 4000) });
            }
          }
          send(sseChunk('\n\n(Tool loop limit reached — please rephrase or narrow the request.)'));
          send('data: [DONE]\n\n');
          controller.close();
        } catch (e: any) {
          const status = e?.status === 429 && e?.source === 'user'
            ? 'Your selected AI provider is rate limiting this request. Try again shortly, choose a lighter model, or switch provider in Settings → Connections.'
            : e?.status === 429
            ? 'Lovable AI is rate limiting this request. Please retry shortly.'
            : e?.status === 402 && e?.source === 'user'
            ? 'Your selected AI provider rejected the request because its quota or billing is unavailable. Check that provider account, or switch provider in Settings → Connections.'
            : e?.status === 402
            ? 'Lovable AI credits are unavailable. View Plans & billing, or add your own API key in Settings → Connections.'
            : `Error: ${e?.message ?? e}`;
          send(sseChunk(status));
          send('data: [DONE]\n\n');
          controller.close();
        }
      },
    });

    const headers: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-AI-Provider': cfg.effectiveProvider,
      'X-AI-Model': cfg.model,
      'X-AI-Source': cfg.source,
      'Access-Control-Expose-Headers': 'X-AI-Provider, X-AI-Model, X-AI-Source, X-AI-Notice',
    };
    if (cfg.notice) {
      // HTTP header values must be ByteStrings (ASCII). Percent-encode any
      // non-ASCII characters (e.g. em-dashes from notice strings).
      headers['X-AI-Notice'] = encodeURIComponent(cfg.notice);
    }
    return new Response(stream, { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});