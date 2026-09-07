import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { resolveAIConfig } from '../_shared/ai-provider.ts';
import { scoreInsiderTransactions, insiderSignalSentence } from '../_shared/insider-signal.ts';

// =====================================================================
// full-analysis — one orchestrated institutional run.
// Chains: live web evidence -> instrument master -> fundamentals/valuation
//         -> advanced simulation (bootstrap + regimes + frictions)
//         -> AI synthesis into a structured decision document.
// =====================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

interface Position { symbol: string; weight: number; fx?: string; ter?: number; borrow_rate?: number; roll_drag?: number }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const auth = req.headers.get('Authorization') ?? '';
  try {
    const body = await req.json();
    const positions: Position[] = (Array.isArray(body.positions) ? body.positions : [])
      .map((p: any) => ({
        symbol: String(p?.symbol ?? '').toUpperCase().trim(),
        weight: Number(p?.weight ?? 0),
        fx: p?.fx ? String(p.fx).toUpperCase() : undefined,
        ter: num(p?.ter), borrow_rate: num(p?.borrow_rate), roll_drag: num(p?.roll_drag),
      }))
      .filter((p: Position) => p.symbol && Number.isFinite(p.weight) && p.weight !== 0)
      .slice(0, 15);
    if (!positions.length) return json({ error: 'positions[] with symbol + weight is required.' }, 400);

    const objective = String(body.objective ?? 'Long-term capital growth').slice(0, 400);
    const horizonYears = Math.min(Math.max(Number(body.horizon_years ?? 10), 1), 30);
    const initial = Number(body.initial_capital ?? 100_000);
    const researchTopics: string[] = Array.isArray(body.research_topics)
      ? body.research_topics.slice(0, 4).map(String)
      : ['global macro outlook policy rates inflation'];

    // ---- 1. Evidence + reference + fundamentals + simulation, in parallel ----
    const [research, master, fundamentals, sim] = await Promise.all([
      Promise.all(researchTopics.map((t, i) =>
        edge(auth, 'web-research', { query: t, lane: i === 0 ? 'macro' : 'any', max_results: 4 }))),
      edge(auth, 'instrument-master', { symbols: positions.map((p) => p.symbol) }),
      Promise.all(positions.slice(0, 8).map(async (p) => {
        const r = await edge(auth, 'deep-analysis', { symbol: p.symbol });
        return {
          symbol: p.symbol,
          fundamentals: r?.fundamentals ?? null,
          valuation: r?.valuation ?? null,
          thesis: r?.analysis?.thesis ?? null,
          recommendation: r?.analysis?.recommendation ?? null,
          error: r?.error ?? null,
        };
      })),
      edge(auth, 'advanced-simulation', {
        mode: 'single',
        assets: positions.map((p) => ({
          symbol: p.symbol, weight: p.weight, fx: p.fx, ter: p.ter,
          borrow_rate: p.borrow_rate, roll_drag: p.roll_drag,
        })),
        config: {
          paths: Number(body.paths ?? 30_000), years: horizonYears, initial,
          method: body.method ?? 'block', regimeSwitching: true,
          taxRate: num(body.tax_rate) ?? 0, transactionCostBps: num(body.transaction_cost_bps) ?? 5,
          maintenanceMargin: num(body.maintenance_margin) ?? 0.25, history: body.history ?? '10y',
        },
      }),
    ]);

    // ---- 1b. Insider / PDMR conviction on each name ----
    const insider = await Promise.all(positions.slice(0, 6).map(async (p) => {
      const r = await edge(auth, 'insider-global', { symbol: p.symbol });
      const signal = scoreInsiderTransactions(r?.transactions ?? [], 180);
      return {
        symbol: p.symbol,
        signal,
        summary: insiderSignalSentence(p.symbol, signal),
        method: r?.method ?? null,
        coverage: r?.coverage ?? 'none',
        sources: (r?.sources ?? []).slice(0, 3),
      };
    }));

    const sources = research.flatMap((r: any) => (r?.sources ?? []).map((s: any) => ({
      title: s.title, url: s.url, domain: s.domain, primary_source: s.primary_source,
    })));
    const evidence = research.flatMap((r: any) => (r?.sources ?? []).map((s: any) =>
      `SOURCE ${s.url}\n${(s.excerpt ?? '').slice(0, 1800)}`)).join('\n\n---\n\n');

    // ---- 2. Synthesis ----
    const cfg = await resolveAIConfig(auth);
    const prompt = `You are a portfolio manager writing an institutional decision document.

MANDATE
Objective: ${objective}
Horizon: ${horizonYears} years. Initial capital: ${initial}.
Proposed book: ${JSON.stringify(positions)}

INSTRUMENT MASTER (verify UCITS vs US-domiciled, TER, KID, tax situs; flag anything marked source:"live" as unverified):
${JSON.stringify(master?.records ?? []).slice(0, 6000)}

SECURITY FUNDAMENTALS & VALUATION:
${JSON.stringify(fundamentals).slice(0, 9000)}

INSIDER / PDMR ACTIVITY (director dealings; treat as a lagging, noisy confirmation signal, never a thesis on its own):
${JSON.stringify(insider.map((i) => ({ symbol: i.symbol, score: i.signal.score, label: i.signal.label, net_value: i.signal.netValue, buyers: i.signal.uniqueBuyers, sellers: i.signal.uniqueSellers, cluster: i.signal.cluster, coverage: i.coverage }))).slice(0, 2500)}

SIMULATION (historical bootstrap with regime switching, frictions, margin mechanics):
${JSON.stringify(sim?.result ?? sim).slice(0, 4000)}

LIVE SOURCE EVIDENCE (cite these URLs; never invent a citation):
${evidence.slice(0, 20000)}

Return STRICT JSON with this shape:
{
 "executive_summary": string,
 "security_analysis": [{"symbol":string,"thesis":string,"variant_view":string,"valuation":string,"bear_base_bull":string,"key_risks":[string],"insider_signal":string,"evidence_urls":[string]}],
 "portfolio_construction": {"rationale":string,"weights":[{"symbol":string,"weight":number,"role":string}],"instrument_notes":[string],"cost_and_tax":string},
 "risks": [{"risk":string,"severity":"low"|"medium"|"high","mitigation":string}],
 "scenarios": [{"name":string,"probability":number,"drivers":string,"portfolio_impact":string}],
 "decision_framework": {"buy_conditions":[string],"sizing_rules":[string],"exit_and_stop_rules":[string],"monitoring":[string],"review_cadence":string},
 "evidence_gaps": [string]
}
Rules: quantify with the simulation numbers where relevant (CVaR, max drawdown, probability of loss). Be explicit about what could NOT be verified. This is research material, not investment advice.`;

    const r = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST', headers: cfg.headers,
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: 'You are a rigorous buy-side PM. Output valid JSON only. Never fabricate citations or figures.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error('full-analysis AI failed', r.status, t.slice(0, 500));
      return json({ error: `AI synthesis failed [${r.status}]`, details: t.slice(0, 400) }, r.status);
    }
    const j = await r.json();
    let report: unknown = {};
    try { report = JSON.parse(j?.choices?.[0]?.message?.content ?? '{}'); } catch { report = { executive_summary: j?.choices?.[0]?.message?.content ?? '' }; }

    return json({
      generated_at: new Date().toISOString(),
      mandate: { objective, horizon_years: horizonYears, initial_capital: initial, positions },
      report,
      simulation: sim?.result ?? null,
      simulation_inputs: sim?.config ?? null,
      // Real borrow/margin economics resolved for any short leg.
      borrow: sim?.borrow ?? null,
      common_days: sim?.commonDays ?? null,
      missing_history: sim?.missing ?? null,
      simulation_warnings: sim?.result?.warnings ?? sim?.error ?? sim?.message ?? (sim && !sim.result ? JSON.stringify(sim).slice(0, 400) : null),
      instruments: master?.records ?? [],
      unverified_instruments: master?.unverified ?? [],
      fundamentals,
      insider,
      sources,
      disclaimer: 'Educational research output. Not investment advice.',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'full analysis failed';
    console.error('full-analysis error:', msg);
    return json({ error: msg }, 500);
  }
});

async function edge(auth: string, fn: string, body: unknown) {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify(body),
    });
    const t = await r.text();
    try {
      const parsed = JSON.parse(t);
      // A non-2xx body is an error even when it parses as JSON.
      if (!r.ok && parsed && typeof parsed === 'object' && !('error' in parsed)) {
        return { ...parsed, error: `${fn} HTTP ${r.status}` };
      }
      return parsed;
    } catch { return { error: `${fn} HTTP ${r.status}: ${t.slice(0, 300)}` }; }
  } catch (e) { return { error: e instanceof Error ? e.message : 'call failed' }; }
}
function num(v: unknown): number | undefined { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
