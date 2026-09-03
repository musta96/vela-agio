import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';
import { resolveAIConfig } from '../_shared/ai-provider.ts';
import { resolveAiAccess, aiDeniedResponse } from '../_shared/ai-access.ts';

const BodySchema = z.object({
  focus: z.string().trim().min(1).max(160),
  jurisdiction: z.string().trim().min(1).max(100),
  topic: z.string().trim().min(1).max(180),
  horizon: z.string().trim().min(1).max(80),
  stance: z.enum(['base', 'upside', 'downside']),
  context: z.string().trim().max(2000).optional(),
});
const OutputSchema = z.object({
  headline: z.string(),
  executiveSummary: z.string(),
  affectedAssets: z.array(z.object({ asset: z.string(), direction: z.enum(['positive', 'negative', 'mixed', 'uncertain']), rationale: z.string() })),
  impacts: z.array(z.object({ dimension: z.enum(['revenue', 'cost', 'capital', 'risk']), severity: z.enum(['high', 'medium', 'low']), assessment: z.string(), timeframe: z.string() })),
  scenarios: z.array(z.object({ name: z.string(), probability: z.string(), outcome: z.string() })),
  assumptions: z.array(z.string()),
  confidence: z.enum(['high', 'medium', 'low']),
  sources: z.array(z.object({ title: z.string(), url: z.string(), relevance: z.string() })),
});
type Body = z.infer<typeof BodySchema>;
const SOURCES = [
  { title: 'European Commission legislative proposals', url: 'https://commission.europa.eu/law/law-making-process/types-eu-law_en', relevance: 'Primary EU legislative process reference.' },
  { title: 'U.S. Federal Register', url: 'https://www.federalregister.gov/', relevance: 'Primary U.S. proposed and final rule publication.' },
  { title: 'OECD Regulatory Policy Outlook', url: 'https://www.oecd.org/gov/regulatory-policy/regulatory-policy-outlook.htm', relevance: 'Cross-market regulatory context.' },
];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function callAI(body: Body, cfg: { baseURL: string; headers: Record<string, string>; model: string }) {
  const prompt = `Return only valid JSON matching this shape: {"headline":"string","executiveSummary":"string","affectedAssets":[{"asset":"string","direction":"positive|negative|mixed|uncertain","rationale":"string"}],"impacts":[{"dimension":"revenue|cost|capital|risk","severity":"high|medium|low","assessment":"string","timeframe":"string"}],"scenarios":[{"name":"string","probability":"string","outcome":"string"}],"assumptions":["string"],"confidence":"high|medium|low","sources":[{"title":"string","url":"string","relevance":"string"}]}. Analyze the possible future regulatory impact, not legal certainty. Do not invent a passed law, exact probability, or unsupported company exposure. Use the supplied public source list and clearly state uncertainty.

Focus: ${body.focus}
Jurisdiction: ${body.jurisdiction}
Regulatory topic/trend: ${body.topic}
Horizon: ${body.horizon}
Scenario stance: ${body.stance}
Additional context: ${body.context ?? 'none'}
Public sources: ${JSON.stringify(SOURCES)}`;
  const response = await fetch(`${cfg.baseURL}/chat/completions`, { method: 'POST', headers: cfg.headers, body: JSON.stringify({ model: cfg.model, messages: [{ role: 'system', content: 'You are a cautious regulatory-policy analyst for investment research. The output must be JSON.' }, { role: 'user', content: prompt }], response_format: { type: 'json_object' } }) });
  if (!response.ok) { const detail = (await response.text()).slice(0, 600); throw new Error(`AI gateway ${response.status}: ${detail}`); }
  const payload = await response.json();
  const raw = payload?.choices?.[0]?.message?.content;
  const parsed = OutputSchema.safeParse(JSON.parse(raw ?? '{}'));
  if (!parsed.success) throw new Error('AI returned an invalid regulatory analysis shape.');
  return parsed.data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed', message: 'POST required.' }, 405);
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'validation_failed', message: 'Focus, jurisdiction, topic, horizon, and stance are required.' }, 400);
  const access = await resolveAiAccess(req.headers.get('Authorization'));
  if (!access.allowed) return aiDeniedResponse(access, corsHeaders);
  try {
    const cfg = await resolveAIConfig(req.headers.get('Authorization'));
    const report = await callAI(parsed.data, cfg);
    return json({ report: { ...report, sources: [...report.sources, ...SOURCES.filter((s) => !report.sources.some((r) => r.url === s.url))] }, generatedAt: new Date().toISOString(), providerNotice: cfg.notice ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Regulatory analysis failed.';
    const match = message.match(/gateway (\d{3})/i);
    const status = match ? Number(match[1]) : 502;
    return json({ error: status === 429 ? 'rate_limited' : 'analysis_failed', message }, status >= 400 && status <= 599 ? status : 502);
  }
});
