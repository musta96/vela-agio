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
// The model is prompted for a fixed shape, but wording drifts (extra enum
// values, a single object instead of a list, a missing section). Parsing is
// therefore tolerant: we accept loose text and normalise it ourselves, so a
// usable report is never discarded over a vocabulary mismatch.
const LooseItem = z.record(z.string(), z.unknown());
const OutputSchema = z.object({
  headline: z.string().optional(),
  executiveSummary: z.string().optional(),
  affectedAssets: z.union([z.array(LooseItem), LooseItem]).optional(),
  impacts: z.union([z.array(LooseItem), LooseItem]).optional(),
  scenarios: z.union([z.array(LooseItem), LooseItem]).optional(),
  assumptions: z.union([z.array(z.string()), z.string()]).optional(),
  confidence: z.string().optional(),
  sources: z.union([z.array(LooseItem), LooseItem]).optional(),
});
type Body = z.infer<typeof BodySchema>;

const DIRECTIONS = ['positive', 'negative', 'mixed', 'uncertain'] as const;
const DIMENSIONS = ['revenue', 'cost', 'capital', 'risk'] as const;
const LEVELS = ['high', 'medium', 'low'] as const;

const asList = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    : v && typeof v === 'object' ? [v as Record<string, unknown>] : [];
const str = (v: unknown, fallback = ''): string => typeof v === 'string' && v.trim() ? v.trim() : fallback;
const pick = <T extends readonly string[]>(v: unknown, allowed: T, fallback: T[number]): T[number] => {
  const value = str(v).toLowerCase();
  return (allowed as readonly string[]).includes(value) ? value as T[number] : fallback;
};

export interface RegulatoryReport {
  headline: string;
  executiveSummary: string;
  affectedAssets: { asset: string; direction: string; rationale: string }[];
  impacts: { dimension: string; severity: string; assessment: string; timeframe: string }[];
  scenarios: { name: string; probability: string; outcome: string }[];
  assumptions: string[];
  confidence: string;
  sources: { title: string; url: string; relevance: string }[];
}

/** Normalise a loosely-shaped model response into the report the UI renders. */
export function normalizeReport(raw: unknown, body: Body): RegulatoryReport {
  const parsed = OutputSchema.safeParse(raw);
  const d = parsed.success ? parsed.data : {};
  const assumptions = Array.isArray(d.assumptions) ? d.assumptions.map((a) => str(a)).filter(Boolean)
    : str(d.assumptions) ? [str(d.assumptions)] : [];
  return {
    headline: str(d.headline, `Regulatory outlook: ${body.topic}`),
    executiveSummary: str(d.executiveSummary, 'The model did not return a summary for this scenario. Re-run the analysis or narrow the regulatory topic.'),
    affectedAssets: asList(d.affectedAssets).map((a) => ({
      asset: str(a.asset ?? a.name ?? a.instrument, body.focus),
      direction: pick(a.direction ?? a.impact, DIRECTIONS, 'uncertain'),
      rationale: str(a.rationale ?? a.reason ?? a.assessment, 'No rationale provided.'),
    })).filter((a) => a.asset),
    impacts: asList(d.impacts).map((i) => ({
      dimension: pick(i.dimension ?? i.channel, DIMENSIONS, 'risk'),
      severity: pick(i.severity ?? i.magnitude, LEVELS, 'medium'),
      assessment: str(i.assessment ?? i.description ?? i.detail, 'No assessment provided.'),
      timeframe: str(i.timeframe ?? i.horizon, body.horizon),
    })),
    scenarios: asList(d.scenarios).map((s) => ({
      name: str(s.name ?? s.scenario, 'Scenario'),
      probability: str(s.probability ?? s.likelihood, 'Not quantified'),
      outcome: str(s.outcome ?? s.description ?? s.impact, 'No outcome described.'),
    })),
    assumptions,
    confidence: pick(d.confidence, LEVELS, 'low'),
    sources: asList(d.sources).map((s) => ({
      title: str(s.title ?? s.name),
      url: str(s.url ?? s.link),
      relevance: str(s.relevance ?? s.description, 'Referenced by the analysis.'),
    })).filter((s) => s.title && /^https?:\/\//.test(s.url)),
  };
}

const SOURCES = [
  { title: 'European Commission legislative proposals', url: 'https://commission.europa.eu/law/law-making-process/types-eu-law_en', relevance: 'Primary EU legislative process reference.' },
  { title: 'U.S. Federal Register', url: 'https://www.federalregister.gov/', relevance: 'Primary U.S. proposed and final rule publication.' },
  { title: 'OECD Regulatory Policy Outlook', url: 'https://www.oecd.org/gov/regulatory-policy/regulatory-policy-outlook.htm', relevance: 'Cross-market regulatory context.' },
];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/**
 * Models return JSON in several wrappers: a bare object, a ```json fenced
 * block, an array of content parts, or prose wrapped around the object.
 * Extract the first JSON object rather than rejecting the whole response.
 */
export function parseModelJson(content: unknown): unknown {
  const text = typeof content === 'string' ? content
    : Array.isArray(content) ? content.map((p) => typeof p === 'string' ? p : str((p as Record<string, unknown>)?.text)).join('')
    : '';
  const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  if (!cleaned) throw new Error('The AI returned an empty regulatory analysis. Please retry.');
  try { return JSON.parse(cleaned); } catch { /* fall through to extraction */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* fall through */ }
  }
  throw new Error('AI returned malformed JSON for the regulatory analysis.');
}

async function callAI(body: Body, cfg: { baseURL: string; headers: Record<string, string>; model: string }) {
  const prompt = `Return only valid JSON matching this shape: {"headline":"string","executiveSummary":"string","affectedAssets":[{"asset":"string","direction":"positive|negative|mixed|uncertain","rationale":"string"}],"impacts":[{"dimension":"revenue|cost|capital|risk","severity":"high|medium|low","assessment":"string","timeframe":"string"}],"scenarios":[{"name":"string","probability":"string","outcome":"string"}],"assumptions":["string"],"confidence":"high|medium|low","sources":[{"title":"string","url":"string","relevance":"string"}]}. Every list must contain at least two entries. Analyze the possible future regulatory impact, not legal certainty. Do not invent a passed law, exact probability, or unsupported company exposure. Use the supplied public source list and clearly state uncertainty.

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
  return normalizeReport(parseModelJson(payload?.choices?.[0]?.message?.content), body);
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
