import { supabase } from "@/integrations/supabase/client";
import { returns, stdev, mean, valueAtRisk, beta, TRADING_DAYS } from "@/lib/riskMetrics";

export interface RiskSnapshot {
  vol: number;    // annualised volatility
  var95: number;  // one-day historical 95% VaR (positive number = loss)
  beta: number | null;
  n: number;      // observations
}

export interface RiskComparison {
  benchmark: string;
  current: RiskSnapshot | null;
  proposed: RiskSnapshot | null;
  combined: RiskSnapshot | null;
}

type Bars = { close: number; t: number }[];

async function fetchCloses(symbol: string, range: "1y" | "3y" = "1y"): Promise<number[]> {
  const { data, error } = await supabase.functions.invoke("market-data", {
    body: { action: "ohlc", symbol, range, interval: "1d" },
  });
  if (error) return [];
  const bars = (data?.bars ?? []) as Bars;
  return bars.map((b) => Number(b.close)).filter((x) => Number.isFinite(x) && x > 0);
}

function alignedReturns(seriesByName: Record<string, number[]>): { symbols: string[]; matrix: number[][] } {
  const symbols = Object.keys(seriesByName);
  const retMatrix = symbols.map((s) => returns(seriesByName[s]));
  const T = retMatrix.length ? Math.min(...retMatrix.map((r) => r.length)) : 0;
  const aligned = retMatrix.map((r) => r.slice(-T));
  return { symbols, matrix: aligned };
}

function portfolioReturnsFromWeights(matrix: number[][], weights: number[]): number[] {
  if (!matrix.length || !matrix[0]?.length) return [];
  const T = matrix[0].length;
  const out: number[] = [];
  for (let t = 0; t < T; t++) {
    let r = 0;
    for (let i = 0; i < matrix.length; i++) r += weights[i] * matrix[i][t];
    out.push(r);
  }
  return out;
}

function snapshot(rets: number[], benchRets?: number[]): RiskSnapshot | null {
  if (rets.length < 30) return null;
  const sd = stdev(rets);
  const annualVol = sd * Math.sqrt(TRADING_DAYS);
  const var95 = Math.max(0, -valueAtRisk(rets, 0.95)); // report as positive loss magnitude
  let b: number | null = null;
  if (benchRets && benchRets.length >= rets.length) {
    const n = Math.min(benchRets.length, rets.length);
    b = beta(rets.slice(-n), benchRets.slice(-n));
  }
  return { vol: annualVol, var95, beta: b, n: rets.length };
}

export interface ComputeRiskParams {
  currentWeights: Record<string, number>;   // symbol -> fraction (0..1)
  proposedWeights: Record<string, number>;  // symbol -> fraction (0..1)
  currentNav: number;
  proposedCapital: number;
  benchmark?: string; // default SPY
  range?: "1y" | "3y";
}

/**
 * Fetches OHLC for every symbol involved + the benchmark and produces
 * before / proposed / combined risk snapshots.
 */
export async function computeRiskComparison(params: ComputeRiskParams): Promise<RiskComparison> {
  const benchmark = (params.benchmark ?? "SPY").toUpperCase();
  const range = params.range ?? "1y";

  const symbols = Array.from(new Set([
    ...Object.keys(params.currentWeights),
    ...Object.keys(params.proposedWeights),
  ]));

  if (!symbols.length) {
    return { benchmark, current: null, proposed: null, combined: null };
  }

  const [benchCloses, ...allCloses] = await Promise.all([
    fetchCloses(benchmark, range),
    ...symbols.map((s) => fetchCloses(s, range)),
  ]);

  const closesBySym: Record<string, number[]> = {};
  symbols.forEach((s, i) => { closesBySym[s] = allCloses[i]; });

  const usable = symbols.filter((s) => closesBySym[s].length >= 30);
  if (!usable.length) return { benchmark, current: null, proposed: null, combined: null };

  const seriesForAlign: Record<string, number[]> = {};
  for (const s of usable) seriesForAlign[s] = closesBySym[s];
  const { matrix } = alignedReturns(seriesForAlign);

  const benchRets = benchCloses.length >= 30 ? returns(benchCloses) : undefined;
  const alignedBench = benchRets && matrix[0]
    ? benchRets.slice(-matrix[0].length)
    : undefined;

  function weightsVector(src: Record<string, number>): number[] | null {
    const raw = usable.map((s) => src[s] ?? 0);
    const total = raw.reduce((s, w) => s + w, 0);
    if (total <= 0) return null;
    return raw.map((w) => w / total);
  }

  const curW = weightsVector(params.currentWeights);
  const propW = weightsVector(params.proposedWeights);

  const combinedNav = params.currentNav + params.proposedCapital;
  const combinedRaw: Record<string, number> = {};
  if (combinedNav > 0) {
    for (const s of usable) {
      const curVal = (params.currentWeights[s] ?? 0) * params.currentNav;
      const propVal = (params.proposedWeights[s] ?? 0) * params.proposedCapital;
      combinedRaw[s] = (curVal + propVal) / combinedNav;
    }
  }
  const combW = weightsVector(combinedRaw);

  const current = curW ? snapshot(portfolioReturnsFromWeights(matrix, curW), alignedBench) : null;
  const proposed = propW ? snapshot(portfolioReturnsFromWeights(matrix, propW), alignedBench) : null;
  const combined = combW ? snapshot(portfolioReturnsFromWeights(matrix, combW), alignedBench) : null;

  return { benchmark, current, proposed, combined };
}