/**
 * Minimal Black-Scholes pricer + Greeks for European options.
 *
 * Not a trading engine — used to enrich the /options page with delta, gamma,
 * theta and vega when Yahoo returns a strike/expiry pair but no Greeks.
 *
 *   S  = spot (last)
 *   K  = strike
 *   T  = time to expiry in YEARS
 *   r  = risk-free rate (annual, cont. comp.)
 *   q  = dividend yield (annual)
 *   iv = implied vol (annual)
 */
export interface Greeks {
  price: number;
  delta: number;
  gamma: number;
  theta: number; // per day
  vega: number;  // per 1% IV change
  d1: number;
  d2: number;
}

function normCdf(x: number): number {
  // Abramowitz & Stegun 7.1.26
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}
function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export function blackScholes(
  kind: "call" | "put",
  S: number, K: number, T: number, r: number, q: number, iv: number,
): Greeks {
  if (!(S > 0 && K > 0 && T > 0 && iv > 0)) {
    return { price: NaN, delta: NaN, gamma: NaN, theta: NaN, vega: NaN, d1: NaN, d2: NaN };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * iv * iv) * T) / (iv * sqrtT);
  const d2 = d1 - iv * sqrtT;
  const eqT = Math.exp(-q * T);
  const erT = Math.exp(-r * T);
  const Nd1 = normCdf(d1);
  const Nd2 = normCdf(d2);
  const nd1 = normPdf(d1);

  let price: number, delta: number, thetaAnnual: number;
  if (kind === "call") {
    price = S * eqT * Nd1 - K * erT * Nd2;
    delta = eqT * Nd1;
    thetaAnnual =
      -(S * eqT * nd1 * iv) / (2 * sqrtT)
      - r * K * erT * Nd2
      + q * S * eqT * Nd1;
  } else {
    price = K * erT * normCdf(-d2) - S * eqT * normCdf(-d1);
    delta = eqT * (Nd1 - 1);
    thetaAnnual =
      -(S * eqT * nd1 * iv) / (2 * sqrtT)
      + r * K * erT * normCdf(-d2)
      - q * S * eqT * normCdf(-d1);
  }
  const gamma = (eqT * nd1) / (S * iv * sqrtT);
  const vega = S * eqT * nd1 * sqrtT / 100; // per 1% IV move
  const theta = thetaAnnual / 365;
  return { price, delta, gamma, theta, vega, d1, d2 };
}

/** Simple Newton implied vol solver, used when Yahoo gives price without IV. */
export function impliedVol(
  kind: "call" | "put",
  targetPrice: number,
  S: number, K: number, T: number, r: number, q: number,
): number | null {
  if (!(targetPrice > 0 && S > 0 && K > 0 && T > 0)) return null;
  let iv = 0.3;
  for (let i = 0; i < 50; i++) {
    const { price, vega } = blackScholes(kind, S, K, T, r, q, iv);
    const diff = price - targetPrice;
    if (Math.abs(diff) < 1e-4) return iv;
    const v = vega * 100; // vega above is per 1% — undo scaling
    if (!Number.isFinite(v) || v < 1e-8) break;
    iv = Math.max(0.001, iv - diff / v);
    if (iv > 5) return null;
  }
  return Number.isFinite(iv) && iv > 0 && iv < 5 ? iv : null;
}

/** Fraction of a year between two epoch-ms timestamps. */
export function yearsBetween(nowMs: number, expiryMs: number): number {
  return Math.max(0, (expiryMs - nowMs) / (365 * 24 * 60 * 60 * 1000));
}