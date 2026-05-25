import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { resolveAIConfig } from '../_shared/ai-provider.ts';

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
    const cfg = await resolveAIConfig(req.headers.get('Authorization'));
    const r = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST',
      headers: cfg.headers,
      body: JSON.stringify({
        model: cfg.model,
        stream: true,
        messages: [{ role: 'system', content: sys }, ...(messages ?? [])],
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: 'Rate limit' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (r.status === 402) return new Response(JSON.stringify({ error: 'Credits exhausted' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const headers: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'X-AI-Provider': cfg.effectiveProvider,
      'X-AI-Model': cfg.model,
      'X-AI-Source': cfg.source,
      'Access-Control-Expose-Headers': 'X-AI-Provider, X-AI-Model, X-AI-Source, X-AI-Notice',
    };
    if (cfg.notice) headers['X-AI-Notice'] = cfg.notice;
    return new Response(r.body, { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});