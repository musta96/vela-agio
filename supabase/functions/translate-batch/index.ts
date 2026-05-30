// Batch translation via Lovable AI Gateway.
// Input: { targetLang: 'it'|'en'|..., texts: string[] }
// Output: { translations: string[] } (same order, same length)
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const LANG_NAMES: Record<string, string> = {
  en: 'English', it: 'Italian', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese',
  nl: 'Dutch', sv: 'Swedish', pl: 'Polish', ru: 'Russian', zh: 'Chinese', ja: 'Japanese',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const { targetLang, texts } = await req.json();
    if (!targetLang || !Array.isArray(texts) || texts.length === 0) {
      return new Response(JSON.stringify({ translations: [] }), { headers: { ...cors, 'content-type': 'application/json' } });
    }
    if (targetLang === 'en') {
      return new Response(JSON.stringify({ translations: texts }), { headers: { ...cors, 'content-type': 'application/json' } });
    }
    const langName = LANG_NAMES[targetLang] ?? targetLang;
    const numbered = texts.map((t, i) => `${i + 1}. ${String(t).replace(/\n/g, ' ')}`).join('\n');
    const sys = `You are a professional UI translator for a financial trading web app.
Translate each numbered English UI string into ${langName}.
Rules:
- Keep tickers, brand names, acronyms (AAPL, ENI.MI, FTSE MIB, MIFID, AI, ETF, EUR, USD) unchanged.
- Keep numbers, percentages, currency symbols and punctuation.
- Preserve length and tone for UI labels.
- Do NOT translate proper nouns or product names.
- Return ONLY a JSON object: {"translations":[{"i":1,"t":"..."}, ...]} with one entry per input, in order.`;
    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [{ role: 'system', content: sys }, { role: 'user', content: numbered }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!r.ok) {
      return new Response(JSON.stringify({ translations: texts, error: `gateway ${r.status}` }), { status: 200, headers: { ...cors, 'content-type': 'application/json' } });
    }
    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content ?? '{}';
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }
    const arr: any[] = Array.isArray(parsed.translations) ? parsed.translations : [];
    const out = texts.map((orig, i) => {
      const hit = arr.find((x) => Number(x.i) === i + 1);
      return typeof hit?.t === 'string' && hit.t.trim() ? hit.t : orig;
    });
    return new Response(JSON.stringify({ translations: out }), { headers: { ...cors, 'content-type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ translations: [], error: String(e) }), { status: 200, headers: { ...cors, 'content-type': 'application/json' } });
  }
});