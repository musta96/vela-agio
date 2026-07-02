import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { isAiOptedOut, aiOptOutResponse } from '../_shared/ai-opt-out.ts';
import { resolveAIConfig } from '../_shared/ai-provider.ts';
import { resolveAiAccess, aiDeniedResponse } from '../_shared/ai-access.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const __aiAccess = await resolveAiAccess(req.headers.get('Authorization'));
  if (!__aiAccess.allowed) return aiDeniedResponse(__aiAccess, corsHeaders);
  try {
    if (await isAiOptedOut(req.headers.get('Authorization'))) return aiOptOutResponse(corsHeaders);
    const { portfolio, risk, lang } = await req.json();
    const langName = lang === "it" ? "Italian" : "English";
    const prompt = `Act as a portfolio doctor. Respond in ${langName}. Review this portfolio and produce: (1) Top 3 concerns (concentration, factor tilts, liquidity, drawdown), (2) Top 3 strengths, (3) 3 concrete proposed trades (ticker, side, % of NAV, rationale, expected risk impact). Be quantitative. JSON keys: concerns[], strengths[], proposed_trades[]. Each item is a short string.

PORTFOLIO: ${JSON.stringify(portfolio).slice(0, 6000)}
RISK METRICS: ${JSON.stringify(risk).slice(0, 4000)}`;
    const cfg = await resolveAIConfig(req.headers.get('Authorization'));
    const r = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST',
      headers: cfg.headers,
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: 'You are a senior buy-side portfolio manager. Return strict JSON.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    const j = await r.json();
    let out = {}; try { out = JSON.parse(j?.choices?.[0]?.message?.content ?? '{}'); } catch {}
    return new Response(JSON.stringify(out), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});