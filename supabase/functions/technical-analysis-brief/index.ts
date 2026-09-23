import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveAIConfig } from '../_shared/ai-provider.ts';
import { resolveAiAccess, aiDeniedResponse } from '../_shared/ai-access.ts';

// AI Trade Thesis: takes the computed technical analysis (patterns, structure,
// insights, SMC zones) and returns a portfolio-manager style trade note.
// Cached per (user, symbol, timeframe, latest-bar timestamp) for 1 hour.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

interface Body {
  symbol: string;
  name?: string;
  timeframe?: string; // e.g. "1D", "1W" — informational only
  lastBarTs: number;
  lastPrice: number;
  analysis: unknown;  // FullAnalysis (client trimmed)
  focus?: string;
  force?: boolean;
}

const cache = new Map<string, { at: number; payload: unknown }>();
const TTL = 60 * 60 * 1000;

const SCHEMA = `{
  "bias": "bullish"|"bearish"|"neutral",
  "conviction": "high"|"medium"|"low",
  "headline": string,
  "thesis": string,
  "keyLevels": [{"label": string, "price": number, "role": "support"|"resistance"|"target"|"invalidation"}],
  "entryPlan": {"entry": number, "stop": number, "target": number, "rr": number},
  "signals": [{"name": string, "bias": "bullish"|"bearish"|"neutral", "detail": string}],
  "risks": [string],
  "confirmations": [string],
  "invalidation": string
}`;

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function getUserId(auth: string | null): Promise<string | null> {
  if (!auth) return null;
  try {
    const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data } = await c.auth.getUser();
    return data.user?.id ?? null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json() as Body;
    if (!body?.symbol || !body?.analysis || !body?.lastBarTs) {
      return jsonResp({ error: 'symbol, analysis and lastBarTs required' }, 400);
    }

    const authHeader = req.headers.get('Authorization');
    const userId = await getUserId(authHeader);
    const access = await resolveAiAccess(authHeader);
    if (!access.allowed) return aiDeniedResponse(access, corsHeaders);

    const key = `${userId ?? 'anon'}|${body.symbol.toUpperCase()}|${body.timeframe ?? ''}|${body.lastBarTs}|${(body.focus ?? '').trim()}`;
    if (!body.force) {
      const hit = cache.get(key);
      if (hit && (Date.now() - hit.at) < TTL) {
        return jsonResp({ ...hit.payload as object, cached: true });
      }
    }

    const cfg = await resolveAIConfig(authHeader);
    // Strip anything that could be read as prompt structure/instructions out of
    // caller-controlled free text before it reaches the model.
    const sanitize = (v: unknown, max: number) =>
      String(v ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/["'`{}<>\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
    const sym = sanitize(body.symbol, 24).toUpperCase();
    const name = sanitize(body.name, 80) || sym;
    const focus = sanitize(body.focus, 200);
    const focusLine = focus ? `The trader is focused on: ${focus}.` : '';

    const systemPrompt = `You are a senior technical strategist writing a trade thesis for ${name} (${sym}).
You are given a JSON object with candlestick patterns, chart patterns, market-structure shifts, support/resistance zones,
trendlines, fair-value gaps, order blocks, liquidity grabs, supply/demand zones and actionable indicator insights all
already computed from real OHLC bars — DO NOT invent new figures. Use the actual prices in the JSON.
Write concise, portfolio-manager grade prose. Be specific: name the pattern, quote the level, state the invalidation.
If evidence is mixed, say so and default to lower conviction. Return STRICT JSON matching this schema exactly: ${SCHEMA}`;

    const userPrompt = `Ticker: ${sym}
Company: ${name}
Timeframe: ${body.timeframe ?? 'daily'}
Last price: ${body.lastPrice}
${focusLine}

ANALYSIS JSON:
"""
${JSON.stringify(body.analysis).slice(0, 60000)}
"""

Produce the JSON trade thesis now.`;

    const r = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST',
      headers: cfg.headers,
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (r.status === 429) return jsonResp({ error: 'rate_limited', message: 'AI is temporarily rate-limited. Please retry shortly.' }, 429);
    if (r.status === 402) return jsonResp({ error: 'credits_exhausted', message: 'AI credits exhausted for this workspace.' }, 402);
    if (!r.ok) {
      const t = await r.text();
      return jsonResp({ error: 'ai_error', message: `AI ${r.status}: ${t.slice(0, 400)}` }, 502);
    }
    const j = await r.json();
    let parsed: unknown = {};
    try { parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? '{}'); } catch { parsed = {}; }
    const payload = {
      symbol: sym, name, timeframe: body.timeframe,
      generatedAt: new Date().toISOString(),
      model: cfg.model,
      providerNotice: cfg.notice,
      thesis: parsed,
    };
    cache.set(key, { at: Date.now(), payload });
    return jsonResp({ ...payload, cached: false });
  } catch (e) {
    console.error('technical-analysis-brief error', e);
    return jsonResp({ error: 'internal', message: String((e as Error)?.message ?? e) }, 500);
  }
});