// Lightweight portfolio optimizers - all free, pure JS.
// Inputs: matrix of asset returns (rows = time, cols = assets).

export type Matrix = number[][];

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
}

export function stdev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
}

export function covMatrix(returns: Matrix): Matrix {
  const n = returns[0]?.length ?? 0;
  const T = returns.length;
  const means = Array.from({ length: n }, (_, j) => mean(returns.map(r => r[j])));
  const cov: Matrix = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      for (let t = 0; t < T; t++) s += (returns[t][i] - means[i]) * (returns[t][j] - means[j]);
      const v = s / Math.max(1, T - 1);
      cov[i][j] = v;
      cov[j][i] = v;
    }
  }
  return cov;
}

// Inverse-variance / risk-parity (volatility-weighted) - closed form.
export function riskParity(cov: Matrix): number[] {
  const inv = cov.map((row, i) => 1 / Math.max(1e-8, Math.sqrt(row[i])));
  const s = inv.reduce((a, b) => a + b, 0);
  return inv.map(v => v / s);
}

// Mean-Variance (max Sharpe, long-only) via projected gradient.
export function meanVariance(returns: Matrix, riskFree = 0): number[] {
  const n = returns[0]?.length ?? 0;
  if (!n) return [];
  const mu = Array.from({ length: n }, (_, j) => mean(returns.map(r => r[j])) - riskFree / 252);
  const cov = covMatrix(returns);
  let w = Array(n).fill(1 / n);
  const lr = 0.05;
  for (let it = 0; it < 500; it++) {
    // gradient of -Sharpe-ish objective: -mu + lambda * cov @ w
    const covW = cov.map(row => row.reduce((a, b, k) => a + b * w[k], 0));
    const grad = mu.map((m, i) => -m + 2 * covW[i]);
    w = w.map((x, i) => Math.max(0, x - lr * grad[i]));
    const s = w.reduce((a, b) => a + b, 0) || 1;
    w = w.map(x => x / s);
  }
  return w;
}

// Hierarchical Risk Parity - simplified (single-cluster recursive bisection on covariance order).
export function hrp(cov: Matrix): number[] {
  const n = cov.length;
  const order = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => cov[a][a] - cov[b][b]);
  const w = Array(n).fill(0);
  function bisect(items: number[], alpha: number) {
    if (items.length === 1) { w[items[0]] += alpha; return; }
    const mid = Math.floor(items.length / 2);
    const left = items.slice(0, mid);
    const right = items.slice(mid);
    const varL = left.reduce((s, i) => s + cov[i][i], 0) / left.length;
    const varR = right.reduce((s, i) => s + cov[i][i], 0) / right.length;
    const aL = 1 - varL / (varL + varR);
    bisect(left, alpha * aL);
    bisect(right, alpha * (1 - aL));
  }
  bisect(order, 1);
  return w;
}

export function portfolioStats(weights: number[], returns: Matrix) {
  const T = returns.length;
  const port = returns.map(r => r.reduce((s, x, i) => s + x * weights[i], 0));
  const mu = mean(port) * 252;
  const vol = stdev(port) * Math.sqrt(252);
  const sharpe = vol > 0 ? mu / vol : 0;
  return { annReturn: mu, annVol: vol, sharpe };
}