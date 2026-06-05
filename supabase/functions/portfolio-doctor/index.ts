import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { isAiOptedOut, aiOptOutResponse } from '../_shared/ai-opt-out.ts';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (await isAiOptedOut(req.headers.get('Authorization'))) return aiOptOutResponse(corsHeaders);
    const { portfolio, risk, lang } = await req.json();
    const langName = lang === "it" ? "Italian" : "English";
    const prompt = `Act as a portfolio doctor. Respond in ${langName}. Review this portfolio and produce: (1) Top 3 concerns (concentration, factor tilts, liquidity, drawdown), (2) Top 3 strengths, (3) 3 concrete proposed trades (ticker, side, % of NAV, rationale, expected risk impact). Be quantitative. JSON keys: concerns[], strengths[], proposed_trades[]. Each item is a short string.

PORTFOLIO: ${JSON.stringify(portfolio).slice(0, 6000)}
RISK METRICS: ${JSON.stringify(risk).slice(0, 4000)}`;
    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
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