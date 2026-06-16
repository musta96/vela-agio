import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { resolveAiAccess, logAiUsage, modelForCap } from '../_shared/ai-access.ts';
import { resolveAIConfig } from '../_shared/ai-provider.ts';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

// Extend CORS to allow the client-supplied correlation id header.
const cors = {
  ...cors,
  'Access-Control-Allow-Headers':
    `${corsHeaders['Access-Control-Allow-Headers'] ?? 'authorization, x-client-info, apikey, content-type'}, x-correlation-id`,
};

function aiAccessDeniedBody(access: Awaited<ReturnType<typeof resolveAiAccess>>, correlationId: string, reason?: string) {
  return {
    error: 'ai_access_denied',
    reason: reason ?? access.reason ?? 'AI is a paid feature. Upgrade or add your own API key in Settings.',
    tier: access.tier,
    quotaUsed: access.quotaUsed,
    quotaLimit: access.quotaLimit,
    upgrade_url: '/pricing',
    byo_url: '/settings#ai',
    fallback: true,
    correlationId,
  };
}

function getCorrelationId(req: Request): string {
  const header = req.headers.get('x-correlation-id');
  if (header && header.length <= 64) return header;
  // Fall back to a server-side id so the response is always traceable.
  return `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function yahooQuote(symbol: string) {
  try {
    const u = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return null;
    const j = await r.json();
    const q = j?.quoteResponse?.result?.[0];
    if (!q) return null;
    return { price: q.regularMarketPrice, changePct: q.regularMarketChangePercent, sector: q.sector };
  } catch { return null; }
}

async function yahooNews(symbol: string) {
  try {
    const u = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=3&quotesCount=0`;
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return [];
    const j = await r.json();
    return (j?.news ?? []).slice(0, 3).map((n: any) => n.title).filter(Boolean);
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const correlationId = getCorrelationId(req);
  try {
    const auth = req.headers.get('Authorization');
    const access = await resolveAiAccess(auth);
    if (!access.allowed) {
      console.warn('[market-briefing] ai_access_denied', JSON.stringify({
        correlationId,
        stage: 'resolveAiAccess',
        userId: access.userId ?? null,
        source: access.source,
        tier: access.tier,
        modelCap: access.modelCap,
        quotaUsed: access.quotaUsed ?? null,
        quotaLimit: access.quotaLimit ?? null,
        reason: access.reason ?? null,
        hasAuthHeader: !!auth,
      }));
      return new Response(
        JSON.stringify(aiAccessDeniedBody(access, correlationId)),
        { status: 200, headers: { ...cors, 'Content-Type': 'application/json', 'x-correlation-id': correlationId } },
      );
    }

    const { holdings = [], watchlist = [], focus = '', lang = 'en' } = await req.json() as {
      holdings: { symbol: string; name?: string; shares?: number; avg_price?: number }[];
      watchlist: { symbol: string; name?: string }[];
      focus?: string;
      lang?: string;
    };

    const langName = lang === 'it' ? 'Italian' : 'English';
    const symbols = Array.from(new Set([
      ...holdings.map((h) => h.symbol),
      ...watchlist.map((w) => w.symbol),
    ])).slice(0, 20);

    const enriched = await Promise.all(symbols.map(async (s) => {
      const [q, news] = await Promise.all([yahooQuote(s), yahooNews(s)]);
      return { symbol: s, price: q?.price, changePct: q?.changePct, sector: q?.sector, headlines: news };
    }));

    const positions = holdings.map((h) => {
      const e = enriched.find((x) => x.symbol === h.symbol);
      const pl = e?.price && h.avg_price ? ((e.price - h.avg_price) / h.avg_price) * 100 : null;
      return { symbol: h.symbol, name: h.name, shares: h.shares, avgPrice: h.avg_price, price: e?.price, plPct: pl != null ? +pl.toFixed(2) : null };
    });

    const sys = `You are Vela.ai's market-briefing analyst. Respond in ${langName}.
Write a concise, personalised market briefing for THIS user based on their actual holdings, watchlist and live data provided.
${focus ? `USER FOCUS (give extra weight to these topics/sectors/tickers): ${focus}` : ''}

Return STRICT JSON:
{
  "headline": "one-line summary (max 90 chars)",
  "body": "2-4 sentences of plain-English briefing. Reference specific tickers and moves from the data. Use **bold** around tickers and key numbers. End with one concrete suggestion (review, watch, no action). No emojis.",
  "highlights": [ { "symbol": "TICKER", "note": "short reason (max 60 chars)", "tone": "positive"|"negative"|"neutral" } ]  // up to 3
}
Never fabricate news. Only cite headlines that appear in the data. If data is sparse, say so honestly.`;

    const user = `LIVE QUOTES & HEADLINES:\n${JSON.stringify(enriched).slice(0, 8000)}\n\nUSER POSITIONS:\n${JSON.stringify(positions).slice(0, 4000)}\n\nUSER WATCHLIST: ${JSON.stringify(watchlist.map((w) => w.symbol))}`;

    const defaultModel = modelForCap(access.modelCap, 'google/gemini-2.5-flash');
    const cfg = access.source === 'byo'
      ? await resolveAIConfig(auth)
      : {
          model: defaultModel,
          baseURL: 'https://ai.gateway.lovable.dev/v1',
          headers: {
            'Lovable-API-Key': LOVABLE_API_KEY,
            'X-Lovable-AIG-SDK': 'vercel-ai-sdk',
            'Content-Type': 'application/json',
          },
          source: 'default',
        };
    const model = cfg.model;
    const r = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST',
      headers: cfg.headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: 'rate_limited', correlationId }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json', 'x-correlation-id': correlationId } });
    if (r.status === 402) {
      console.warn('[market-briefing] ai_access_denied', JSON.stringify({
        correlationId,
        stage: 'gateway_402',
        userId: access.userId ?? null,
        source: access.source,
        tier: access.tier,
        model,
      }));
      return new Response(
        JSON.stringify(aiAccessDeniedBody(access, correlationId, 'AI credits are unavailable. Upgrade or add your own API key in Settings.')),
        { status: 200, headers: { ...cors, 'Content-Type': 'application/json', 'x-correlation-id': correlationId } },
      );
    }
    const j = await r.json();
    logAiUsage({ userId: access.userId, feature: 'briefing', model, provider: 'lovable', success: r.ok });
    let out: any = { headline: '', body: '', highlights: [] };
    try { out = JSON.parse(j?.choices?.[0]?.message?.content ?? '{}'); } catch {}
    out._meta = { symbols: symbols.length, hasFocus: !!focus, generatedAt: new Date().toISOString(), correlationId };
    return new Response(JSON.stringify(out), { headers: { ...cors, 'Content-Type': 'application/json', 'x-correlation-id': correlationId } });
  } catch (e) {
    console.error('[market-briefing] unhandled', JSON.stringify({ correlationId, error: String(e) }));
    return new Response(JSON.stringify({ error: String(e), correlationId }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json', 'x-correlation-id': correlationId } });
  }
});