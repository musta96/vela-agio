/**
 * Correlated Monte Carlo engine for arbitrary portfolios.
 *
 * - Annualised μ/σ per asset are estimated from historical daily log-returns
 * - Pearson correlation matrix is combined with the σ vector to reconstruct Σ
 * - Cholesky-decomposes the per-step covariance to draw correlated shocks
 * - Simulates GBM paths with monthly time stepping by default and aggregates
 *   portfolio value at every step into a fan chart
 * - Returns VaR/CVaR (95 & 99), percentile bands, CDF, fan-chart points and
 *   first-order tornado sensitivities via an analytical mean/variance bump.
 *
 * Pure functions, deterministic when `rng` is provided.
 */

export interface SimAsset {
  symbol: string;
  weight: number;      // 0..1 — auto-normalised by the engine
  mu: number;          // annualised log-return drift
  sigma: number;       // annualised vol
}

export interface SimulationInput {
  assets: SimAsset[];
  corr: number[][];                   // n×n Pearson correlation
  initialValue: number;
  horizonYears: number;
  runs: number;
  stepsPerYear?: number;              // default 12 (monthly)
  riskFreeRate?: number;              // annualised, default 0
  /** Inject a deterministic uniform RNG for tests. */
  rng?: () => number;
}

export interface FanPoint { step: number; year: number; p05: number; p25: number; p50: number; p75: number; p95: number }
export interface CdfPoint { x: number; p: number }
export interface SensitivityPoint { symbol: string; deltaExpected: number; deltaVar95: number }

export interface SimulationResult {
  initialValue: number;
  horizonYears: number;
  runs: number;
  steps: number;
  finalValues: number[];
  expected: number;
  median: number;
  stdev: number;
  expectedReturnPct: number;          // implied CAGR from mean final value
  realizedVolPct: number;             // annualised sd of realised log-returns
  sharpe: number;
  percentiles: { p01: number; p05: number; p25: number; p50: number; p75: number; p95: number; p99: number };
  var95: number;                      // VaR as POSITIVE loss vs initial value
  cvar95: number;
  var99: number;
  cvar99: number;
  probLoss: number;
  probDouble: number;
  fanChart: FanPoint[];
  cdf: CdfPoint[];
  sensitivity: SensitivityPoint[];
}

/** Lower-triangular Cholesky factor of a symmetric positive semi-definite A. */
export function cholesky(A: number[][]): number[][] {
  const n = A.length;
  const L: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
      if (i === j) {
        const d = A[i][i] - sum;
        L[i][j] = Math.sqrt(Math.max(d, 1e-12));
      } else {
        const denom = L[j][j] || 1e-12;
        L[i][j] = (A[i][j] - sum) / denom;
      }
    }
  }
  return L;
}

function defaultRandn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function boxMuller(rng: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function quantileSorted(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[idx];
}

/** Annualise mean and std from a list of daily-log-return arrays. */
export function estimateAssetStats(
  logReturns: number[][],
  periodsPerYear = 252,
): { mu: number; sigma: number }[] {
  return logReturns.map((rs) => {
    if (!rs.length) return { mu: 0, sigma: 0.20 };
    const m = rs.reduce((a, b) => a + b, 0) / rs.length;
    const v = rs.reduce((a, b) => a + (b - m) * (b - m), 0) / Math.max(1, rs.length - 1);
    return { mu: m * periodsPerYear, sigma: Math.sqrt(v * periodsPerYear) };
  });
}

export function runPortfolioSimulation(input: SimulationInput): SimulationResult {
  const { assets, corr, initialValue, horizonYears, runs } = input;
  const stepsPerYear = input.stepsPerYear ?? 12;
  const rf = input.riskFreeRate ?? 0;
  const randn = input.rng ? () => boxMuller(input.rng!) : defaultRandn;
  const n = assets.length;
  if (!n) throw new Error("runPortfolioSimulation: at least one asset is required");
  const steps = Math.max(1, Math.round(horizonYears * stepsPerYear));
  const dt = horizonYears / steps;

  // Normalise weights so the engine is robust to ~1 sums or unscaled inputs.
  const wSum = assets.reduce((s, a) => s + a.weight, 0) || 1;
  const w = assets.map((a) => a.weight / wSum);
  const mu = assets.map((a) => a.mu);
  const sigma = assets.map((a) => a.sigma);

  // Reconstruct annualised Σ = D · R · D.
  const cov: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      cov[i][j] = sigma[i] * sigma[j] * (corr[i]?.[j] ?? (i === j ? 1 : 0));
    }
  }

  const stepCov: number[][] = cov.map((row) => row.map((x) => x * dt));
  const L = cholesky(stepCov);
  const drift = mu.map((m, i) => (m - 0.5 * cov[i][i]) * dt);

  // Fan-chart: sample ≤60 step indices, store run-aligned values for quantiles.
  const fanCount = Math.min(steps, 60);
  const stride = Math.max(1, Math.floor(steps / fanCount));
  const sampleIdx: number[] = [];
  for (let s = stride; s <= steps; s += stride) sampleIdx.push(s);
  if (sampleIdx[sampleIdx.length - 1] !== steps) sampleIdx.push(steps);
  const stepValues: number[][] = sampleIdx.map(() => new Array(runs));

  const finalValues = new Array<number>(runs);
  const cumR = new Array<number>(n);
  const z = new Array<number>(n);

  for (let r = 0; r < runs; r++) {
    for (let i = 0; i < n; i++) cumR[i] = 0;
    let nextSample = 0;
    for (let s = 1; s <= steps; s++) {
      for (let i = 0; i < n; i++) z[i] = randn();
      for (let i = 0; i < n; i++) {
        let lz = 0;
        for (let k = 0; k <= i; k++) lz += L[i][k] * z[k];
        cumR[i] += drift[i] + lz;
      }
      if (nextSample < sampleIdx.length && s === sampleIdx[nextSample]) {
        let pv = 0;
        for (let i = 0; i < n; i++) pv += w[i] * Math.exp(cumR[i]);
        stepValues[nextSample][r] = pv * initialValue;
        nextSample++;
      }
    }
    let pv = 0;
    for (let i = 0; i < n; i++) pv += w[i] * Math.exp(cumR[i]);
    finalValues[r] = pv * initialValue;
  }

  const sorted = [...finalValues].sort((a, b) => a - b);
  const pct = (q: number) => quantileSorted(sorted, q);

  const expected = finalValues.reduce((a, b) => a + b, 0) / runs;
  const median = pct(0.5);
  const sVar = finalValues.reduce((a, b) => a + (b - expected) ** 2, 0) / Math.max(1, runs - 1);
  const stdev = Math.sqrt(sVar);

  const probLoss = finalValues.filter((v) => v < initialValue).length / runs;
  const probDouble = finalValues.filter((v) => v >= 2 * initialValue).length / runs;

  const var95 = Math.max(0, initialValue - pct(0.05));
  const var99 = Math.max(0, initialValue - pct(0.01));
  const tail95 = sorted.slice(0, Math.max(1, Math.floor(runs * 0.05)));
  const tail99 = sorted.slice(0, Math.max(1, Math.floor(runs * 0.01)));
  const cvar95 = Math.max(0, initialValue - tail95.reduce((a, b) => a + b, 0) / tail95.length);
  const cvar99 = Math.max(0, initialValue - tail99.reduce((a, b) => a + b, 0) / tail99.length);

  const expectedReturnPct = horizonYears > 0 ? Math.pow(Math.max(expected, 1e-9) / initialValue, 1 / horizonYears) - 1 : 0;
  const logRetsAnn = finalValues.map((v) => Math.log(Math.max(v, 1e-9) / initialValue) / Math.max(horizonYears, 1e-9));
  const lm = logRetsAnn.reduce((a, b) => a + b, 0) / logRetsAnn.length;
  const lv = logRetsAnn.reduce((a, b) => a + (b - lm) ** 2, 0) / Math.max(1, logRetsAnn.length - 1);
  const realizedVolPct = Math.sqrt(lv);
  const sharpe = realizedVolPct > 0 ? (expectedReturnPct - rf) / realizedVolPct : 0;

  const fanChart: FanPoint[] = sampleIdx.map((sIdx, ti) => {
    const arr = [...stepValues[ti]].sort((a, b) => a - b);
    const q = (qq: number) => quantileSorted(arr, qq);
    return { step: sIdx, year: sIdx / stepsPerYear, p05: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95) };
  });

  const cdfPoints = Math.min(200, runs);
  const cdf: CdfPoint[] = [];
  for (let i = 0; i < cdfPoints; i++) {
    const idx = Math.min(sorted.length - 1, Math.floor((i / Math.max(1, cdfPoints - 1)) * (sorted.length - 1)));
    cdf.push({ x: sorted[idx], p: (idx + 1) / sorted.length });
  }

  const sensitivity = analyticalTornado(assets, mu, cov, w, initialValue, horizonYears, 0.05);

  return {
    initialValue, horizonYears, runs, steps,
    finalValues, expected, median, stdev,
    expectedReturnPct, realizedVolPct, sharpe,
    percentiles: { p01: pct(0.01), p05: pct(0.05), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p95: pct(0.95), p99: pct(0.99) },
    var95, cvar95, var99, cvar99,
    probLoss, probDouble,
    fanChart, cdf, sensitivity,
  };
}

/**
 * Analytical first-order sensitivity: bump asset i's weight by `bump` (pp),
 * pull the rest proportionally, recompute E[V_T] and parametric 95% VaR.
 * Cheap, deterministic, good for tornado plots — pairs well with the MC
 * engine which is the "ground truth" for distributional outputs.
 */
function analyticalTornado(
  assets: SimAsset[],
  mu: number[],
  cov: number[][],
  w: number[],
  V0: number,
  T: number,
  bump: number,
): SensitivityPoint[] {
  const n = assets.length;
  const muBase = w.reduce((s, wi, i) => s + wi * mu[i], 0);
  let varBase = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) varBase += w[i] * w[j] * cov[i][j];
  const expBase = V0 * Math.exp(muBase * T);
  const varBaseLoss = Math.max(0, V0 - V0 * Math.exp(muBase * T - 1.645 * Math.sqrt(Math.max(varBase, 0) * T)));
  if (n < 2) return assets.map((a) => ({ symbol: a.symbol, deltaExpected: 0, deltaVar95: 0 }));
  return assets.map((a, i) => {
    const w2 = w.slice();
    w2[i] = Math.min(1, w2[i] + bump);
    const others = w.map((_, k) => k).filter((k) => k !== i);
    const otherSum = others.reduce((s, k) => s + w[k], 0);
    if (otherSum > 0) {
      for (const k of others) w2[k] = Math.max(0, w[k] - bump * (w[k] / otherSum));
    }
    const muNew = w2.reduce((s, wi, ii) => s + wi * mu[ii], 0);
    let varNew = 0;
    for (let ii = 0; ii < n; ii++) for (let jj = 0; jj < n; jj++) varNew += w2[ii] * w2[jj] * cov[ii][jj];
    const expNew = V0 * Math.exp(muNew * T);
    const varNewLoss = Math.max(0, V0 - V0 * Math.exp(muNew * T - 1.645 * Math.sqrt(Math.max(varNew, 0) * T)));
    return { symbol: a.symbol, deltaExpected: expNew - expBase, deltaVar95: varNewLoss - varBaseLoss };
  });
}