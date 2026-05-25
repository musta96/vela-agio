import type { OHLCBar } from "./technicalIndicators";
import {
  returns,
  mean,
  stdev,
  valueAtRisk,
  expectedShortfall,
  beta,
  maxDrawdown,
  realizedVol,
  sharpe,
  TRADING_DAYS,
} from "./riskMetrics";

export interface PortfolioPosition {
  symbol: string;
  name?: string;
  bars: OHLCBar[];
  value: number; // current market value in base currency
}

/** Align return series to the shortest length and same index. */
function alignReturns(series: number[][]): number[][] {
  if (!series.length) return [];
  const n = Math.min(...series.map((s) => s.length));
  return series.map((s) => s.slice(-n));
}

/** Compute portfolio daily returns weighted by current value. */
export function portfolioReturns(positions: PortfolioPosition[]): number[] {
  const valid = positions.filter((p) => p.bars.length > 2);
  if (!valid.length) return [];
  const totalVal = valid.reduce((s, p) => s + p.value, 0);
  if (totalVal <= 0) return [];
  const w = valid.map((p) => p.value / totalVal);
  const rets = alignReturns(valid.map((p) => returns(p.bars.map((b) => b.close))));
  const n = rets[0]?.length ?? 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let j = 0; j < rets.length; j++) r += w[j] * rets[j][i];
    out.push(r);
  }
  return out;
}

export interface PortfolioRisk {
  vol: number; // annualized
  sharpe: number;
  maxDD: number;
  var95: number;
  cvar95: number;
  var99: number;
  cvar99: number;
  parametricVaR95: number;
  beta: number | null;
  meanDailyRet: number;
}

export function computePortfolioRisk(positions: PortfolioPosition[], benchmarkBars?: OHLCBar[]): PortfolioRisk | null {
  const r = portfolioReturns(positions);
  if (r.length < 30) return null;
  const equity: number[] = [1];
  r.forEach((x) => equity.push(equity[equity.length - 1] * (1 + x)));
  const { maxDD } = maxDrawdown(equity);
  const m = mean(r);
  const sd = stdev(r);
  // Parametric (normal) one-day VaR at 95% = mean - 1.645*sd
  const parametricVaR95 = m - 1.645 * sd;
  let b: number | null = null;
  if (benchmarkBars && benchmarkBars.length > 30) {
    const bRets = returns(benchmarkBars.map((x) => x.close));
    b = beta(r, bRets);
  }
  return {
    vol: realizedVol(r),
    sharpe: sharpe(r),
    maxDD,
    var95: valueAtRisk(r, 0.95),
    cvar95: expectedShortfall(r, 0.95),
    var99: valueAtRisk(r, 0.99),
    cvar99: expectedShortfall(r, 0.99),
    parametricVaR95,
    beta: b,
    meanDailyRet: m,
  };
}

/** Stress scenarios — return $ impact on portfolio given a one-period shock. */
export interface StressScenario {
  name: string;
  description: string;
  marketShock?: number; // % return on market (e.g. -0.10)
  rateShockBps?: number; // bps move on rates (proxy effect via beta)
  oilShockPct?: number;
  fxShockPct?: number; // base currency vs USD
}

export const DEFAULT_SCENARIOS: StressScenario[] = [
  { name: "Lehman 2008", description: "−25% equity shock + +200bps spreads", marketShock: -0.25, rateShockBps: 200 },
  { name: "COVID 2020", description: "−35% equity shock in 30 days", marketShock: -0.35 },
  { name: "Volmageddon", description: "−10% equity shock with vol blowup", marketShock: -0.10 },
  { name: "ECB hawkish surprise", description: "+150bps surprise hike", rateShockBps: 150, marketShock: -0.05 },
  { name: "Oil supply shock", description: "Oil +50% / EU recession scare", oilShockPct: 0.50, marketShock: -0.08 },
  { name: "EUR weakness", description: "EUR/USD −10%", fxShockPct: -0.10, marketShock: 0.02 },
  { name: "Bull case", description: "+10% market rally", marketShock: 0.10 },
];

export function applyStress(
  positions: PortfolioPosition[],
  scenario: StressScenario,
  portfolioBeta: number | null,
): { pnl: number; pnlPct: number } {
  const totalVal = positions.reduce((s, p) => s + p.value, 0);
  if (totalVal <= 0) return { pnl: 0, pnlPct: 0 };
  const b = portfolioBeta ?? 1;
  let pnlPct = 0;
  if (scenario.marketShock != null) pnlPct += scenario.marketShock * b;
  if (scenario.rateShockBps != null) pnlPct += -(scenario.rateShockBps / 10000) * 5 * 0.3; // crude duration proxy
  if (scenario.oilShockPct != null) pnlPct += scenario.oilShockPct * 0.05; // small commodity sensitivity proxy
  if (scenario.fxShockPct != null) pnlPct += scenario.fxShockPct * 0.3; // partial FX translation effect
  return { pnl: pnlPct * totalVal, pnlPct };
}

/** Multi-factor beta exposures. */
export interface FactorExposure {
  factor: string;
  symbol: string;
  beta: number;
}

export function factorExposures(
  portfRets: number[],
  factors: Array<{ factor: string; symbol: string; bars: OHLCBar[] }>,
): FactorExposure[] {
  return factors
    .filter((f) => f.bars.length > 30)
    .map((f) => ({
      factor: f.factor,
      symbol: f.symbol,
      beta: beta(portfRets, returns(f.bars.map((b) => b.close))),
    }));
}

/** Concentration metrics. */
export function concentration(positions: PortfolioPosition[]) {
  const total = positions.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return { hhi: 0, top1: 0, top3: 0, effectiveN: 0 };
  const weights = positions.map((p) => p.value / total).sort((a, b) => b - a);
  const hhi = weights.reduce((s, w) => s + w * w, 0); // 0..1
  const top1 = weights[0] ?? 0;
  const top3 = weights.slice(0, 3).reduce((s, w) => s + w, 0);
  const effectiveN = hhi > 0 ? 1 / hhi : 0;
  return { hhi, top1, top3, effectiveN };
}

export { TRADING_DAYS };