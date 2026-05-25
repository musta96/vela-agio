import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { messages, portfolio, watchlist, lang } = await req.json();
    const langName = lang === "it" ? "Italian" : "English";
    const sys = `You are the user's personal investment research copilot for the FTSE MIB Analytics platform.
ALWAYS respond in ${langName}.
You have full read access to the user's portfolio and watchlist provided in context.
Be specific, number-driven, and balanced. Cite metrics. Always end with: "This is not financial advice."

PORTFOLIO: ${JSON.stringify(portfolio ?? []).slice(0, 4000)}
WATCHLIST: ${JSON.stringify(watchlist ?? []).slice(0, 2000)}`;
    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        stream: true,
        messages: [{ role: 'system', content: sys }, ...(messages ?? [])],
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: 'Rate limit' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (r.status === 402) return new Response(JSON.stringify({ error: 'Credits exhausted' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    return new Response(r.body, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});