// startup-screener — rank startups by the required-IRR (VC) method and the
// Scorecard method, with filters on country, sector and stage.
//
// Purely deterministic: it runs the same benchmark engine used by the startup
// valuation tab over every candidate, so no AI access is needed. Candidates
// come from the caller's saved startups, an inline list, or external discovery.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { valueStartup, type StartupInputs, type Stage, STAGES } from '../_shared/startup-valuation.ts';
import { discoverStartups, type StartupCandidate } from '../_shared/startup-discovery.ts';

interface Candidate {
  id?: string;
  name: string;
  country?: string;
  sector?: string;
  stage?: string;
  currency?: string;
  website?: string;
  inputs?: Partial<StartupInputs>;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const asStage = (s: unknown): Stage => (STAGES.includes(String(s) as Stage) ? (String(s) as Stage) : 'seed');

function candidateFromDiscovery(c: StartupCandidate): Candidate {
  return {
    name: c.name,
    country: normalizeCountry(c.country),
    sector: normalizeSector(c.sector),
    stage: asStage(c.stage),
    currency: (c.currency || 'USD').toUpperCase(),
    website: c.website ?? undefined,
    inputs: {
      roundSize: c.roundSize ?? undefined,
      previousRounds: c.roundSize ? [{ stage: c.stage || 'seed', amount: c.roundSize, date: c.roundDate || undefined, postMoney: c.valuation ?? undefined, investors: c.investors }] : undefined,
    },
  };
}

function normalizeCountry(c?: string): string {
  if (!c) return 'US';
  const s = c.toUpperCase().trim();
  if (s === 'USA' || s === 'UNITED STATES') return 'US';
  if (s === 'UK' || s === 'UNITED KINGDOM' || s === 'GREAT BRITAIN') return 'GB';
  if (s === 'ITALY' || s === 'ITALIA') return 'IT';
  if (s === 'FRANCE') return 'FR';
  if (s === 'GERMANY' || s === 'DEUTSCHLAND') return 'DE';
  if (s === 'ISRAEL') return 'IL';
  if (s === 'INDIA') return 'IN';
  if (s === 'SINGAPORE') return 'SG';
  if (s === 'CANADA') return 'CA';
  return s.slice(0, 2);
}

function normalizeSector(s?: string): string {
  if (!s) return 'software';
  const k = s.toLowerCase().replace(/[^a-z]/g, '');
  const map: Record<string, string> = {
    ai: 'ai', artificialintelligence: 'ai', machinelearning: 'ai', fintech: 'fintech',
    insurtech: 'insurtech', healthtech: 'healthtech', biotech: 'biotech', medtech: 'medtech',
    saas: 'saas', software: 'software', marketplace: 'marketplace', ecommerce: 'ecommerce',
    cybersecurity: 'cybersecurity', deeptech: 'deeptech', semiconductors: 'semiconductors',
    climate: 'climate', energy: 'energy', mobility: 'mobility', robotics: 'robotics',
    space: 'space', foodtech: 'foodtech', edtech: 'edtech', proptech: 'proptech',
    agritech: 'agritech', logistics: 'logistics', gaming: 'gaming', consumer: 'consumer',
    hardware: 'hardware', services: 'services', data: 'software', devtools: 'software',
  };
  return map[k] || 'software';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization');
    const body = await req.json().catch(() => ({}));
    const filters = (body?.filters ?? {}) as { countries?: string[]; sectors?: string[]; stages?: string[] };
    const hurdle = Number(body?.requiredIrr);
    const rank = String(body?.rank ?? 'required_irr'); // 'required_irr' | 'scorecard' | 'upside'
    const source = String(body?.source ?? 'saved'); // 'saved' | 'discover'

    const candidates: Candidate[] = Array.isArray(body?.candidates) ? body.candidates.slice(0, 100) : [];
    const warnings: string[] = [];

    // Pull the caller's saved startups when asked. RLS scopes them to the user.
    if (source !== 'discover' && body?.includeSaved !== false && auth) {
      const sb = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: auth } }, auth: { persistSession: false } },
      );
      const { data } = await sb.from('private_companies')
        .select('id,name,country,sector,stage,currency,website,inputs,kind')
        .eq('kind', 'startup').limit(200);
      for (const row of data ?? []) {
        candidates.push({
          id: row.id, name: row.name, country: row.country, sector: row.sector,
          stage: row.stage, currency: row.currency, website: row.website ?? undefined,
          inputs: (row.inputs ?? {}) as Partial<StartupInputs>,
        });
      }
    }

    // Discover external candidates when the caller asks for it.
    if (source === 'discover') {
      const discovery = await discoverStartups({
        query: body?.query,
        sector: body?.filters?.sectors?.[0],
        stage: body?.filters?.stages?.[0],
        country: body?.filters?.countries?.[0],
        sources: body?.discoverySources || ['news', 'sec_formd'],
        limit: Math.min(Number(body?.limit) || 25, 100),
        authHeader: auth,
      });
      for (const c of discovery.candidates) {
        candidates.push(candidateFromDiscovery(c));
      }
      warnings.push(...discovery.warnings);
    }

    const filtered = candidates.filter((c) => {
      if (filters.countries?.length && !filters.countries.includes(String(c.country ?? '').toUpperCase())) return false;
      if (filters.sectors?.length && !filters.sectors.includes(String(c.sector ?? '').toLowerCase())) return false;
      if (filters.stages?.length && !filters.stages.includes(asStage(c.stage))) return false;
      return true;
    });

    const rows = filtered.map((c) => {
      const inputs: StartupInputs = {
        ...(c.inputs ?? {}),
        stage: asStage(c.stage ?? c.inputs?.stage),
        country: String(c.country ?? c.inputs?.country ?? 'IT').toUpperCase(),
        sector: String(c.sector ?? c.inputs?.sector ?? 'software').toLowerCase(),
        currency: String(c.currency ?? c.inputs?.currency ?? 'EUR').toUpperCase(),
        // A screener-wide fund hurdle overrides the per-company one when given.
        requiredIrr: Number.isFinite(hurdle) && hurdle > 0 ? hurdle : c.inputs?.requiredIrr,
      };
      const v = valueStartup(inputs);
      const method = (key: string) => v.methods.find((m) => m.key === key) ?? null;
      const irrMethod = method('required_irr')?.preMoney != null ? method('required_irr') : method('vc_method');
      const score = method('scorecard');
      const askPre = Number(c.inputs?.roundSize) && Number(c.inputs?.targetOwnership)
        ? Number(c.inputs!.roundSize) / Number(c.inputs!.targetOwnership) - Number(c.inputs!.roundSize)
        : null;
      const fair = v.range?.weighted ?? null;
      // Upside = how far the modelled fair value sits above what the founders ask.
      const upside = askPre && fair ? fair / askPre - 1 : null;
      return {
        id: c.id ?? null, name: c.name, website: c.website ?? null,
        country: inputs.country, sector: inputs.sector, stage: inputs.stage,
        currency: inputs.currency, region: v.region,
        requiredIrr: v.requiredIrr.irr, irrSource: v.requiredIrr.source,
        irrValuation: irrMethod?.preMoney ?? null, irrDetail: irrMethod?.detail ?? '',
        scorecardValuation: score?.preMoney ?? null, scorecardDetail: score?.detail ?? '',
        benchmarkMedian: v.benchmark.median,
        weighted: fair, low: v.range?.low ?? null, high: v.range?.high ?? null,
        askPreMoney: askPre, upside, runwayMonths: v.runwayMonths,
        notes: v.notes,
      };
    });

    const key = rank === 'scorecard' ? 'scorecardValuation' : rank === 'upside' ? 'upside' : 'irrValuation';
    rows.sort((a, b) => {
      const av = a[key as keyof typeof a] as number | null;
      const bv = b[key as keyof typeof b] as number | null;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av;
    });

    return json({ rank, count: rows.length, requiredIrr: Number.isFinite(hurdle) ? hurdle : null, rows, warnings, source });
  } catch (e) {
    return json({ error: 'failed', message: e instanceof Error ? e.message : 'Screening failed' }, 500);
  }
});
