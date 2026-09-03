import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import {
  loadHistory, alignReturns, simulate, searchBlends, mergeSleeves,
  type AssetSpec, type SimConfig, type BlendCandidate, type BlendConstraints,
} from '../_shared/advanced-sim.ts';

// POST { mode: "single" | "blend", assets?, sleeves?, config?, constraints? }
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const mode: 'single' | 'blend' = body.mode === 'blend' ? 'blend' : 'single';
    const config: SimConfig = {
      paths: body.config?.paths ?? (mode === 'blend' ? 8000 : 30_000),
      years: body.config?.years ?? 10,
      initial: body.config?.initial ?? 100_000,
      method: body.config?.method ?? 'block',
      blockSize: body.config?.blockSize ?? 10,
      regimeSwitching: body.config?.regimeSwitching !== false,
      dfTail: body.config?.dfTail ?? 5,
      taxRate: body.config?.taxRate ?? 0,
      transactionCostBps: body.config?.transactionCostBps ?? 5,
      maintenanceMargin: body.config?.maintenanceMargin ?? 0.25,
      history: body.config?.history ?? '10y',
      seed: body.config?.seed,
    };

    const sleeves: BlendCandidate[] = mode === 'blend'
      ? (Array.isArray(body.sleeves) ? body.sleeves : []).map((s: any, i: number) => ({
          name: String(s?.name ?? `Sleeve ${i + 1}`).slice(0, 40),
          assets: normalizeAssets(s?.assets),
        })).filter((s: BlendCandidate) => s.assets.length)
      : [];

    const assets: AssetSpec[] = mode === 'blend'
      ? sleeves.flatMap((s) => s.assets)
      : normalizeAssets(body.assets);

    if (!assets.length) {
      return json({ error: 'No assets provided. Send assets:[{symbol,weight,...}] or sleeves:[{name,assets}].' }, 400);
    }
    if (assets.length > 30) return json({ error: 'Maximum 30 distinct instruments per run.' }, 400);

    const { series, missing } = await loadHistory(assets, config.history ?? '10y');
    if (!Object.keys(series).length) {
      return json({ error: 'No usable price history could be fetched for these symbols.', missing }, 502);
    }
    const { returns, dates } = alignReturns(series);

    if (mode === 'blend') {
      const cons: BlendConstraints = {
        maxCvar95: body.constraints?.maxCvar95,
        maxDrawdown: body.constraints?.maxDrawdown,
        maxWeightPerSled: body.constraints?.maxWeightPerSleeve ?? body.constraints?.maxWeightPerSled,
        step: Math.min(Math.max(body.constraints?.step ?? 0.1, 0.05), 0.5),
      };
      const rows = searchBlends(sleeves, returns, config, cons);
      const best = rows.find((r) => r.feasible) ?? rows[0] ?? null;
      return json({
        mode, sleeves: sleeves.map((s) => s.name), constraints: cons,
        commonDays: dates.length, missing,
        best, blends: rows.slice(0, 25),
        bestMerged: best ? mergeSleeves(sleeves, best.mix) : null,
        disclaimer: 'Simulation output is information, not investment advice.',
      });
    }

    const result = simulate(assets, returns, config);
    return json({
      mode, config, commonDays: dates.length, missing,
      result,
      disclaimer: 'Simulation output is information, not investment advice.',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'simulation failed';
    console.error('advanced-simulation error:', msg);
    return json({ error: msg }, 500);
  }
});

function normalizeAssets(raw: unknown): AssetSpec[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a: any) => ({
      symbol: String(a?.symbol ?? '').toUpperCase().trim(),
      weight: Number(a?.weight ?? 0),
      ter: num(a?.ter),
      spreadBps: num(a?.spread_bps ?? a?.spreadBps),
      borrowRate: num(a?.borrow_rate ?? a?.borrowRate),
      rollDragPct: num(a?.roll_drag ?? a?.rollDragPct),
      fx: a?.fx ? String(a.fx).toUpperCase() : undefined,
    }))
    .filter((a) => a.symbol && Number.isFinite(a.weight) && a.weight !== 0);
}
function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
