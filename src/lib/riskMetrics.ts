// Risk & position-sizing toolkit.
// All functions are pure and take simple arrays of prices / returns.

import type { OHLCBar } from "./technicalIndicators";
import { atr } from "./technicalIndicators";

export const TRADING_DAYS = 252;

/** Convert close prices to simple daily returns. */
export function returns(closes: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) r.push(closes[i] / closes[i - 1] - 1);
  return r;
}

/** Mean of an array. */
export function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation. */
export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** Annualized Sharpe ratio. rf is annualized risk-free (e.g. 0.03). */
export function sharpe(rets: number[], rf = 0.02): number {
  if (rets.length < 2) return 0;
  const s = stdev(rets);
  if (s === 0) return 0;
  const excess = mean(rets) - rf / TRADING_DAYS;
  return (excess / s) * Math.sqrt(TRADING_DAYS);
}

/** Annualized Sortino (downside-deviation Sharpe). */
export function sortino(rets: number[], rf = 0.02): number {
  if (rets.length < 2) return 0;
  const targ = rf / TRADING_DAYS;
  const downs = rets.filter((r) => r < targ).map((r) => (r - targ) ** 2);
  if (!downs.length) return 0;
  const dd = Math.sqrt(downs.reduce((a, b) => a + b, 0) / downs.length);
  if (dd === 0) return 0;
  return ((mean(rets) - targ) / dd) * Math.sqrt(TRADING_DAYS);
}

/** Maximum drawdown over an equity curve (peak-to-trough %, negative). */
export function maxDrawdown(equity: number[]): { maxDD: number; peakIdx: number; troughIdx: number } {
  let peak = equity[0] ?? 0;
  let peakIdx = 0;
  let maxDD = 0;
  let troughIdx = 0;
  let curPeak = 0;
  for (let i = 0; i < equity.length; i++) {
    if (equity[i] > peak) {
      peak = equity[i];
      curPeak = i;
    }
    const dd = peak === 0 ? 0 : (equity[i] - peak) / peak;
    if (dd < maxDD) {
      maxDD = dd;
      peakIdx = curPeak;
      troughIdx = i;
    }
  }
  return { maxDD, peakIdx, troughIdx };
}

/** Calmar = CAGR / |MaxDD|. */
export function calmar(rets: number[]): number {
  if (rets.length < 30) return 0;
  const equity: number[] = [1];
  rets.forEach((r) => equity.push(equity[equity.length - 1] * (1 + r)));
  const { maxDD } = maxDrawdown(equity);
  if (maxDD === 0) return 0;
  const years = rets.length / TRADING_DAYS;
  const cagr = equity[equity.length - 1] ** (1 / years) - 1;
  return cagr / Math.abs(maxDD);
}

/** Historical Value-at-Risk (95% by default) - negative percent loss. */
export function valueAtRisk(rets: number[], confidence = 0.95): number {
  if (rets.length < 20) return 0;
  const sorted = [...rets].sort((a, b) => a - b);
  const idx = Math.max(0, Math.floor((1 - confidence) * sorted.length) - 1);
  return sorted[idx];
}

/** Expected Shortfall / CVaR - mean loss beyond VaR. */
export function expectedShortfall(rets: number[], confidence = 0.95): number {
  if (rets.length < 20) return 0;
  const sorted = [...rets].sort((a, b) => a - b);
  const cutoff = Math.max(1, Math.floor((1 - confidence) * sorted.length));
  const tail = sorted.slice(0, cutoff);
  return mean(tail);
}

/** Beta of asset vs benchmark (aligned daily returns). */
export function beta(assetRets: number[], benchRets: number[]): number {
  const n = Math.min(assetRets.length, benchRets.length);
  if (n < 30) return 1;
  const a = assetRets.slice(-n);
  const b = benchRets.slice(-n);
  const ma = mean(a);
  const mb = mean(b);
  let cov = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    varB += (b[i] - mb) ** 2;
  }
  if (varB === 0) return 1;
  return cov / varB;
}

/** Pearson correlation. */
export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

/** Annualized realized volatility. */
export function realizedVol(rets: number[]): number {
  return stdev(rets) * Math.sqrt(TRADING_DAYS);
}

/** ATR-based stop loss & take-profit suggestions. */
export interface StopTargets {
  entry: number;
  atr: number;
  longStop: number;
  longTarget1: number; // 2R
  longTarget2: number; // 3R
  shortStop: number;
  shortTarget1: number;
  shortTarget2: number;
  stopDistancePct: number;
}
export function atrStops(bars: OHLCBar[], stopMult = 1.5, targetMult = 3): StopTargets | null {
  if (bars.length < 20) return null;
  const a = atr(bars, 14);
  const aLast = a[a.length - 1];
  if (aLast == null) return null;
  const entry = bars[bars.length - 1].close;
  const longStop = entry - stopMult * aLast;
  const shortStop = entry + stopMult * aLast;
  return {
    entry,
    atr: aLast,
    longStop,
    longTarget1: entry + 2 * stopMult * aLast,
    longTarget2: entry + targetMult * aLast,
    shortStop,
    shortTarget1: entry - 2 * stopMult * aLast,
    shortTarget2: entry - targetMult * aLast,
    stopDistancePct: (Math.abs(entry - longStop) / entry) * 100,
  };
}

/** Fractional Kelly position size.
 *  edge: prob of win (0..1); winLoss: avg win / avg loss ratio. */
export function kelly(edge: number, winLoss: number, fraction = 0.5): number {
  if (winLoss <= 0) return 0;
  const f = edge - (1 - edge) / winLoss;
  return Math.max(0, Math.min(1, f * fraction));
}

/** Position size in shares from risk-per-trade and ATR stop. */
export function positionSize(
  accountEquity: number,
  riskPctPerTrade: number,
  entry: number,
  stop: number
): { shares: number; dollarRisk: number; notional: number; pctOfEquity: number } {
  const dollarRisk = accountEquity * (riskPctPerTrade / 100);
  const perShareRisk = Math.abs(entry - stop);
  if (perShareRisk === 0) return { shares: 0, dollarRisk: 0, notional: 0, pctOfEquity: 0 };
  const shares = Math.floor(dollarRisk / perShareRisk);
  const notional = shares * entry;
  return {
    shares,
    dollarRisk,
    notional,
    pctOfEquity: (notional / accountEquity) * 100,
  };
}

/** Compose a one-shot risk summary. */
export interface RiskSummary {
  vol: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  maxDD: number;
  var95: number;
  es95: number;
  beta: number | null;
  stops: StopTargets | null;
  rrLong: { stop: number; tp1: number; tp2: number; rrTo1: number; rrTo2: number } | null;
}

export function riskSummary(bars: OHLCBar[], benchBars?: OHLCBar[]): RiskSummary | null {
  if (bars.length < 30) return null;
  const closes = bars.map((b) => b.close);
  const rets = returns(closes);
  const equity: number[] = [1];
  rets.forEach((r) => equity.push(equity[equity.length - 1] * (1 + r)));
  const { maxDD } = maxDrawdown(equity);
  const stops = atrStops(bars);
  let bnch: number | null = null;
  if (benchBars && benchBars.length > 30) {
    const bRets = returns(benchBars.map((b) => b.close));
    bnch = beta(rets, bRets);
  }
  return {
    vol: realizedVol(rets),
    sharpe: sharpe(rets),
    sortino: sortino(rets),
    calmar: calmar(rets),
    maxDD,
    var95: valueAtRisk(rets, 0.95),
    es95: expectedShortfall(rets, 0.95),
    beta: bnch,
    stops,
    rrLong: stops
      ? {
          stop: stops.longStop,
          tp1: stops.longTarget1,
          tp2: stops.longTarget2,
          rrTo1: 2,
          rrTo2: (stops.longTarget2 - stops.entry) / (stops.entry - stops.longStop),
        }
      : null,
  };
}

/** Mansfield Relative Strength (price/index, normalized to 0 mean). */
export function mansfieldRS(closes: number[], idxCloses: number[], maPeriod = 52): {
  rs: number[];
  rsMA: (number | null)[];
  current: number | null;
  slope: number | null;
} {
  const n = Math.min(closes.length, idxCloses.length);
  if (n < maPeriod + 5) return { rs: [], rsMA: [], current: null, slope: null };
  const a = closes.slice(-n);
  const b = idxCloses.slice(-n);
  const ratio = a.map((c, i) => (b[i] === 0 ? 0 : c / b[i]));
  const ma: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < ratio.length; i++) {
    sum += ratio[i];
    if (i >= maPeriod) sum -= ratio[i - maPeriod];
    ma.push(i >= maPeriod - 1 ? sum / maPeriod : null);
  }
  const rs = ratio.map((r, i) => {
    const m = ma[i];
    return m && m !== 0 ? ((r / m) - 1) * 100 : 0;
  });
  const cur = rs[rs.length - 1] ?? null;
  const past = rs[Math.max(0, rs.length - 21)] ?? null;
  const slope = cur != null && past != null ? cur - past : null;
  return { rs, rsMA: ma, current: cur, slope };
}

/** ADX trend strength + regime classification. */
export function adx(bars: OHLCBar[], period = 14): { adx: (number | null)[]; current: number | null } {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length < period * 2) return { adx: out, current: null };
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [bars[0].high - bars[0].low];
  for (let i = 1; i < bars.length; i++) {
    const upMove = bars[i].high - bars[i - 1].high;
    const downMove = bars[i - 1].low - bars[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    const h = bars[i].high, l = bars[i].low, pc = bars[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  // Wilder smoothing
  const smooth = (arr: number[]) => {
    const s: number[] = new Array(arr.length).fill(0);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += arr[i];
    s[period - 1] = sum;
    for (let i = period; i < arr.length; i++) s[i] = s[i - 1] - s[i - 1] / period + arr[i];
    return s;
  };
  const trS = smooth(tr);
  const pS = smooth(plusDM);
  const mS = smooth(minusDM);
  const dx: number[] = new Array(bars.length).fill(0);
  for (let i = period - 1; i < bars.length; i++) {
    const pdi = trS[i] ? (100 * pS[i]) / trS[i] : 0;
    const mdi = trS[i] ? (100 * mS[i]) / trS[i] : 0;
    dx[i] = pdi + mdi === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / (pdi + mdi);
  }
  let sum = 0;
  for (let i = period - 1; i < period * 2 - 1 && i < dx.length; i++) sum += dx[i];
  let prev = sum / period;
  out[period * 2 - 2] = prev;
  for (let i = period * 2 - 1; i < bars.length; i++) {
    prev = (prev * (period - 1) + dx[i]) / period;
    out[i] = prev;
  }
  return { adx: out, current: out[out.length - 1] };
}

export type MarketRegime = "strong-trend" | "trending" | "ranging" | "choppy";
export function classifyRegime(bars: OHLCBar[]): { regime: MarketRegime; adx: number | null; vol: number } {
  const { current } = adx(bars);
  const rets = returns(bars.map((b) => b.close));
  const vol = realizedVol(rets) * 100;
  let regime: MarketRegime = "ranging";
  if (current == null) regime = "choppy";
  else if (current >= 40) regime = "strong-trend";
  else if (current >= 25) regime = "trending";
  else if (current < 15) regime = "choppy";
  return { regime, adx: current, vol };
}

/** Multi-timeframe confluence: pass daily + weekly analysis scores. */
export function mtfConfluence(scores: { tf: string; score: number }[]): {
  agree: boolean;
  direction: "bullish" | "bearish" | "mixed";
  strength: number;
} {
  if (!scores.length) return { agree: false, direction: "mixed", strength: 0 };
  const bull = scores.every((s) => s.score > 10);
  const bear = scores.every((s) => s.score < -10);
  const avg = scores.reduce((a, b) => a + b.score, 0) / scores.length;
  return {
    agree: bull || bear,
    direction: bull ? "bullish" : bear ? "bearish" : "mixed",
    strength: Math.abs(avg),
  };
}

/** Detect double tops/bottoms & head-and-shoulders on recent pivots (rule-based). */
export type ChartPattern = "Double Top" | "Double Bottom" | "Head & Shoulders" | "Inverse H&S" | "Ascending Triangle" | "Descending Triangle";

export function detectChartPatterns(bars: OHLCBar[]): ChartPattern[] {
  if (bars.length < 40) return [];
  const lookback = Math.min(bars.length, 120);
  const slice = bars.slice(-lookback);
  const highs: { i: number; v: number }[] = [];
  const lows: { i: number; v: number }[] = [];
  const w = 3;
  for (let i = w; i < slice.length - w; i++) {
    let isH = true, isL = true;
    for (let j = i - w; j <= i + w; j++) {
      if (j === i) continue;
      if (slice[j].high >= slice[i].high) isH = false;
      if (slice[j].low <= slice[i].low) isL = false;
    }
    if (isH) highs.push({ i, v: slice[i].high });
    if (isL) lows.push({ i, v: slice[i].low });
  }
  const out: ChartPattern[] = [];
  const tol = 0.02;
  // Double top: last 2 highs within tol%, separated by a real trough
  if (highs.length >= 2) {
    const [a, b] = highs.slice(-2);
    if (Math.abs(a.v - b.v) / a.v < tol && b.i - a.i > 5) {
      const trough = Math.min(...slice.slice(a.i, b.i).map((s) => s.low));
      if (trough < a.v * (1 - tol * 2)) out.push("Double Top");
    }
  }
  if (lows.length >= 2) {
    const [a, b] = lows.slice(-2);
    if (Math.abs(a.v - b.v) / a.v < tol && b.i - a.i > 5) {
      const peak = Math.max(...slice.slice(a.i, b.i).map((s) => s.high));
      if (peak > a.v * (1 + tol * 2)) out.push("Double Bottom");
    }
  }
  // H&S: 3 highs where middle > outer two and outer two roughly equal
  if (highs.length >= 3) {
    const [l, m, r] = highs.slice(-3);
    if (m.v > l.v && m.v > r.v && Math.abs(l.v - r.v) / l.v < tol * 1.5) out.push("Head & Shoulders");
  }
  if (lows.length >= 3) {
    const [l, m, r] = lows.slice(-3);
    if (m.v < l.v && m.v < r.v && Math.abs(l.v - r.v) / l.v < tol * 1.5) out.push("Inverse H&S");
  }
  // Ascending triangle: flat highs, rising lows
  if (highs.length >= 2 && lows.length >= 2) {
    const [h1, h2] = highs.slice(-2);
    const [l1, l2] = lows.slice(-2);
    if (Math.abs(h1.v - h2.v) / h1.v < tol && l2.v > l1.v * (1 + tol)) out.push("Ascending Triangle");
    if (Math.abs(l1.v - l2.v) / l1.v < tol && h2.v < h1.v * (1 - tol)) out.push("Descending Triangle");
  }
  return out;
}