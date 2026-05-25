import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { resolveAIConfig } from '../_shared/ai-provider.ts';
import { getInvestorProfileSummary } from '../_shared/investor-profile.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getUserDataKey } from '../_shared/data-provider.ts';
import { PLATFORM_MAP } from '../_shared/platform-map.ts';

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
  { type: 'function', function: { name: 'propose_live_order', description: 'Propose a LIVE (real-money) order on Alpaca or IBKR. Does NOT place the order — it creates a pending intent that pops a confirm modal in the UI. The user MUST click Confirm before anything is sent to the broker. Use ONLY when the user explicitly asks to trade live (not paper). Default to place_paper_order otherwise.',
      parameters: { type: 'object', properties: {
        broker: { type: 'string', enum: ['alpaca', 'ibkr'], description: 'alpaca uses Alpaca LIVE endpoint (requires LIVE keys). ibkr stores the intent for the user to place via their Client Portal Gateway.' },
        symbol: { type: 'string' }, side: { type: 'string', enum: ['buy', 'sell'] },
        qty: { type: 'number' }, type: { type: 'string', enum: ['market', 'limit'] },
        limit_price: { type: 'number' }, time_in_force: { type: 'string', enum: ['day', 'gtc'] },
        rationale: { type: 'string', description: 'One-sentence reason shown to the user in the confirm modal.' },
      }, required: ['broker', 'symbol', 'side', 'qty', 'type', 'rationale'] } } },
  { type: 'function', function: { name: 'capture_feature_request', description: 'Use ONLY when the user asks for a capability that is NOT in the PLATFORM MAP above. Captures a feature request for the product team with your structured analysis. After calling, tell the user it has been forwarded.',
      parameters: { type: 'object', properties: {
        title: { type: 'string', description: 'Short, action-oriented title (max 80 chars).' },
        user_quote: { type: 'string', description: 'Verbatim or near-verbatim quote of what the user asked for.' },
        why_it_matters: { type: 'string', description: 'Why this is valuable to investors / how it fits the platform.' },
        proposed_implementation: { type: 'string', description: 'High-level plan: which pages, data sources, edge functions, models, schema changes.' },
        effort: { type: 'string', enum: ['S', 'M', 'L', 'XL'] },
        priority: { type: 'string', enum: ['nice-to-have', 'should-have', 'must-have'] },
      }, required: ['title', 'user_quote', 'why_it_matters', 'proposed_implementation', 'effort', 'priority'] } } },
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
    if (!r.ok) return { error: `yahoo ${r.status}` };
    const j = await r.json();
    const q = j?.quoteResponse?.result?.[0];
    if (!q) return { error: 'no quote' };
    return {
      symbol: q.symbol, name: q.longName ?? q.shortName,
      price: q.regularMarketPrice, currency: q.currency, exchange: q.fullExchangeName,
      changePct: q.regularMarketChangePercent, dayHigh: q.regularMarketDayHigh, dayLow: q.regularMarketDayLow,
      marketCap: q.marketCap, peTrailing: q.trailingPE, dividendYield: q.trailingAnnualDividendYield,
    };
  } catch (e: any) { return { error: e?.message ?? 'fetch failed' }; }
}

async function execTool(name: string, args: any, ctx: { authHeader: string }): Promise<any> {
  const sb = userClient(ctx.authHeader);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: 'not authenticated' };

  switch (name) {
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
    case 'propose_live_order': {
      const { data, error } = await sb.from('live_order_intents').insert({
        user_id: user.id,
        broker: args.broker,
        symbol: String(args.symbol).toUpperCase(),
        side: args.side,
        qty: args.qty,
        type: args.type,
        limit_price: args.limit_price ?? null,
        time_in_force: args.time_in_force ?? 'day',
        rationale: args.rationale ?? null,
      }).select('id, expires_at').single();
      if (error) return { error: error.message };
      return { ok: true, intent_id: data.id, expires_at: data.expires_at, mode: 'LIVE', awaiting_user_confirmation: true, ui_action: 'A confirm modal has popped on the user\'s screen. Tell them to review and click Confirm or Reject within 5 minutes.' };
    }
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
    throw Object.assign(new Error(`AI ${r.status}: ${text.slice(0, 200)}`), { status: r.status });
  }
  return await r.json();
}

// Final streaming call (no more tools — model must respond in prose)
async function chatStream(cfg: any, messages: any[]) {
  return await fetch(`${cfg.baseURL}/chat/completions`, {
    method: 'POST', headers: cfg.headers,
    body: JSON.stringify({ model: cfg.model, messages, stream: true }),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { messages, portfolio, watchlist, lang, attachments, pageContext } = await req.json();
    const langName = lang === 'it' ? 'Italian' : 'English';
    const investorProfile = await getInvestorProfileSummary(auth);
    const sys = `You are the user's personal investment research copilot for the Vela.ai platform.
ALWAYS respond in ${langName}.
You can call tools to read live data, mutate the user's portfolio/watchlist/alerts, place PAPER (sandbox) orders on Alpaca, and capture feature requests for the product team.
You ALSO act as a support agent: you have a complete map of every page on the platform and can guide the user to the exact route.

RULES:
- Before ANY mutation (add/remove/update holdings or watchlist, create alerts, place orders) confirm intent with the user explicitly UNLESS they already gave a clear directive in their latest message.
- For place_paper_order: always state it is PAPER (sandbox), summarize the order, and only call the tool after the user has confirmed.
- For propose_live_order: this is REAL money. Triple-check intent. Always summarize the order + risk in chat first, ask the user "place a live order?", and only call after they explicitly say yes. The tool itself does NOT execute — it pops a confirm modal where the user must click Confirm. Default to paper if the user is ambiguous.
- Be number-driven. Cite metrics from tool outputs. Mark uncertainty.
- Tailor tone, risk language, instrument complexity and ESG filters to the user's MiFID II suitability profile when available.
 - If the user asks for a feature/page/capability that is NOT in the PLATFORM MAP, do NOT pretend it exists. Instead: (1) acknowledge it doesn't yet exist, (2) call capture_feature_request with a real analysis (why it matters, proposed implementation, effort, priority), (3) tell the user it has been forwarded to the product team.
 - When the user attaches a screenshot or refers to "this page", use the PAGE CONTEXT and any image attachments to ground your answer. You can describe what you see in their screenshot and walk them through the UI step by step.
 - For pure support questions ("how do I X", "where do I find Y", "why doesn't Z work") answer concisely and link the relevant /route from the PLATFORM MAP.
- Always end final answers with: "This is not financial advice."

CONTEXT:
CURRENT PAGE: ${pageContext ?? 'unknown'}
PORTFOLIO: ${JSON.stringify(portfolio ?? []).slice(0, 4000)}
WATCHLIST: ${JSON.stringify(watchlist ?? []).slice(0, 2000)}
SUITABILITY (MiFID II): ${investorProfile ?? 'not completed — invite the user to fill /suitability'}

${PLATFORM_MAP}`;

    const cfg = await resolveAIConfig(auth);
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
          const status = e?.status === 429 ? 'Rate limit — please retry shortly.' : e?.status === 402 ? 'AI credits exhausted. Add credits in Settings → Workspace → Usage.' : `Error: ${e?.message ?? e}`;
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
    if (cfg.notice) headers['X-AI-Notice'] = cfg.notice;
    return new Response(stream, { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});