import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { isAiOptedOut, aiOptOutResponse } from '../_shared/ai-opt-out.ts';
import { resolveAIConfig } from '../_shared/ai-provider.ts';

const PROXY = 'https://api.allorigins.win/raw?url=';

async function newsFor(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=10`;
  const r = await fetch(PROXY + encodeURIComponent(url));
  if (!r.ok) return [];
  const j = await r.json();
  return (j?.news ?? []).map((n: any) => ({ title: n.title, publisher: n.publisher, link: n.link, ts: n.providerPublishTime }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (await isAiOptedOut(req.headers.get('Authorization'))) return aiOptOutResponse(corsHeaders);
    const { symbols, lang } = await req.json();
    const langName = lang === "it" ? "Italian" : "English";
    const all: any[] = [];
    for (const s of (symbols ?? []).slice(0, 15)) {
      const items = await newsFor(s);
      items.forEach((n: any) => all.push({ symbol: s, ...n }));
    }
    if (!all.length) return new Response(JSON.stringify({ items: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const cfg = await resolveAIConfig(req.headers.get('Authorization'));
    const r = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST',
      headers: cfg.headers,
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: `You are a sell-side news triage. Respond in ${langName} (the "reason" field). Classify materiality. Return STRICT JSON: {items:[{symbol,title,link,materiality:"high"|"medium"|"low",impact:"bullish"|"bearish"|"neutral",reason}]}.` },
          { role: 'user', content: `Triage these and keep only HIGH or MEDIUM materiality items: ${JSON.stringify(all).slice(0, 12000)}` },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    const j = await r.json();
    let out: any = { items: [] }; try { out = JSON.parse(j?.choices?.[0]?.message?.content ?? '{"items":[]}'); } catch {}
    return new Response(JSON.stringify(out), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});