import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { resolveAIConfig, type AIConfig } from '../_shared/ai-provider.ts';
import { resolveAiAccess, aiDeniedResponse } from '../_shared/ai-access.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface Body { symbol: string; name?: string; lang?: string }

async function invokeFn(fn: string, body: any, authHeader: string) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${fn} ${r.status}`);
  return r.json();
}

async function aiSection(cfg: AIConfig, prompt: string, schema: string, lang = "en") {
  const langName = lang === "it" ? "Italian" : "English";
  const r = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: 'POST',
    headers: cfg.headers,
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: `You are a senior sell-side equity analyst at a top-tier investment bank. Write ALL prose fields in ${langName}. Write rigorous, balanced, number-driven research. Be specific, not vague. Return STRICT JSON only matching: ${schema}` },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!r.ok) throw new Error(`AI ${r.status}: ${await r.text()}`);
  const j = await r.json();
  try { return JSON.parse(j?.choices?.[0]?.message?.content ?? '{}'); } catch { return {}; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const __aiAccess = await resolveAiAccess(req.headers.get('Authorization'));
  if (!__aiAccess.allowed) return aiDeniedResponse(__aiAccess, corsHeaders);
  try {
    const body = (await req.json()) as Body;
    if (!body?.symbol) {
      return new Response(JSON.stringify({ error: 'symbol required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const sym = body.symbol.toUpperCase();
    const name = body.name || sym;
    const authHeader = req.headers.get('Authorization') ?? `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
    const cfg = await resolveAIConfig(req.headers.get('Authorization'));

    // 1. Pull existing deep analysis (fundamentals + DCF/DDM + base AI)
    const deep = await invokeFn('deep-analysis', { symbol: sym, name }, authHeader).catch(() => null);
    // 2. Pull sentiment if possible
    const sentiment = await invokeFn('analyze-sentiment', { symbol: sym, name }, authHeader).catch(() => null);

    const ctx = JSON.stringify({
      symbol: sym,
      name,
      fundamentals: deep?.fundamentals,
      liquidity: deep?.liquidity,
      valuation: deep?.valuation,
      baseAnalysis: deep?.analysis,
      sentimentSummary: sentiment?.summary,
    });

    // 3. Generate richer sections
    const [industry, peers, catalysts, esg, technicalView, executiveSummary] = await Promise.all([
      aiSection(
        cfg,
        `Write an industry / sector overview for ${name} (${sym}). Cover market size, growth, competitive dynamics, regulation, and ${name}'s position. Context: ${ctx}`,
        '{"overview": string, "growth": string, "regulation": string, "positioning": string}',
      ),
      aiSection(
        cfg,
        `Identify 4-6 listed peer companies for ${name} (${sym}) and rate ${name} vs peers on growth, margins, valuation, balance sheet. Context: ${ctx}`,
        '{"peers":[{"symbol":string,"name":string,"comment":string}],"verdict":"cheaper-than-peers"|"in-line"|"premium","rationale":string}',
      ),
      aiSection(
        cfg,
        `List the top upcoming catalysts (next 6-18 months) for ${name} — earnings, product launches, regulation, M&A, dividends. Context: ${ctx}`,
        '{"catalysts":[{"title":string,"timing":string,"impact":"positive"|"negative"|"mixed","note":string}]}',
      ),
      aiSection(
        cfg,
        `Provide an ESG snapshot for ${name}: environmental footprint, social/governance highlights and concerns. Context: ${ctx}`,
        '{"environment":string,"social":string,"governance":string,"controversies":[string],"score":"strong"|"adequate"|"weak"}',
      ),
      aiSection(
        cfg,
        `Provide a concise technical setup commentary for ${name} based on fundamentals and liquidity. No invented price levels. Context: ${ctx}`,
        '{"setup":string,"keyLevels":string,"timeframe":"short"|"medium"|"long"}',
      ),
      aiSection(
        cfg,
        `Write a sharp 4-paragraph executive summary on ${name} for a portfolio manager. Context: ${ctx}`,
        '{"summary":string}',
      ),
    ]);

    return new Response(JSON.stringify({
      symbol: sym,
      name,
      generatedAt: new Date().toISOString(),
      deep,
      sentiment,
      sections: {
        executiveSummary: executiveSummary?.summary,
        industry,
        peers,
        catalysts: catalysts?.catalysts ?? [],
        esg,
        technicalView,
      },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('research-report error', e);
    return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});