/**
 * Pure timing-signal math shared by tests, the /technical card, and the
 * server-side edge function (which keeps its own compact copy in Deno).
 *
 * Everything here is dependency-free so it can run in Vitest without the
 * Supabase/AI SDK graph.
 */
import type { TimingDirection, TimingResult, TimingSignal } from "./schema";

export interface Bar { t: number; close: number; }

/** RSI(period). Wilder smoothing. Returns the latest value or NaN. */
export function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return NaN;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgG = gains / period;
  let avgL = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
  }
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
}

/** SMA at index i (last N closes ending at i inclusive). */
export function sma(closes: number[], period: number, endIdx = closes.length - 1): number {
  if (endIdx + 1 < period) return NaN;
  let s = 0;
  for (let i = endIdx - period + 1; i <= endIdx; i++) s += closes[i];
  return s / period;
}

/** EMA series. */
export function emaSeries(closes: number[], period: number): number[] {
  if (closes.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = new Array(closes.length);
  out[0] = closes[0];
  for (let i = 1; i < closes.length; i++) out[i] = closes[i] * k + out[i - 1] * (1 - k);
  return out;
}

/** MACD(12,26,9). Returns histogram last two values for cross detection. */
export function macdCross(closes: number[]): { hist: number; prevHist: number; macd: number; signal: number } {
  if (closes.length < 35) return { hist: NaN, prevHist: NaN, macd: NaN, signal: NaN };
  const e12 = emaSeries(closes, 12);
  const e26 = emaSeries(closes, 26);
  const macdLine = e12.map((v, i) => v - e26[i]);
  const signalLine = emaSeries(macdLine.slice(25), 9);
  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  const prevMacd = macdLine[macdLine.length - 2];
  const prevSignal = signalLine[signalLine.length - 2];
  return { hist: macd - signal, prevHist: prevMacd - prevSignal, macd, signal };
}

/** Weight → direction contribution. */
function contribution(sig: TimingSignal): number {
  if (sig.direction === "buy") return sig.weight;
  if (sig.direction === "avoid") return -sig.weight;
  return 0;
}

export function scoreSignals(signals: TimingSignal[]): { score: number; verdict: TimingDirection } {
  const raw = signals.reduce((a, s) => a + contribution(s), 0);
  const score = Math.max(-100, Math.min(100, Math.round(raw)));
  const verdict: TimingDirection = score > 25 ? "buy" : score < -25 ? "avoid" : "wait";
  return { score, verdict };
}

export interface BuildSignalsInput {
  closes: number[];
  /** Optional fundamentals (from deep-analysis). */
  fundamentals?: { trailingPE?: number; forwardPE?: number; peFiveYearMedian?: number } | null;
  /** Days since last earnings; undefined if unknown. */
  daysSinceEarnings?: number;
  /** Price gap vs pre-earnings close as a fraction (e.g. -0.06 = 6% dip). */
  postEarningsGap?: number;
  /** Days until next earnings; undefined if unknown. */
  daysToEarnings?: number;
  /** Days until next FOMC/ECB decision. */
  daysToPolicy?: number;
  /** Days until next CPI print. */
  daysToCpi?: number;
}

/** Assemble the signal list for a ticker from prepared inputs. Deterministic. */
export function buildSignals(input: BuildSignalsInput): TimingSignal[] {
  const out: TimingSignal[] = [];
  const c = input.closes;
  const last = c[c.length - 1];

  // --- technicals ---
  const rsiV = rsi(c, 14);
  if (Number.isFinite(rsiV)) {
    if (rsiV <= 30) out.push({ family: "tech", key: "rsi", label: `RSI(14) ${rsiV.toFixed(0)} — oversold`, value: rsiV, direction: "buy", weight: 20 });
    else if (rsiV >= 70) out.push({ family: "tech", key: "rsi", label: `RSI(14) ${rsiV.toFixed(0)} — overbought`, value: rsiV, direction: "avoid", weight: 20 });
    else out.push({ family: "tech", key: "rsi", label: `RSI(14) ${rsiV.toFixed(0)} — neutral`, value: rsiV, direction: "wait", weight: 5 });
  }

  const mc = macdCross(c);
  if (Number.isFinite(mc.hist) && Number.isFinite(mc.prevHist)) {
    if (mc.prevHist <= 0 && mc.hist > 0) out.push({ family: "tech", key: "macd", label: "MACD bullish crossover", direction: "buy", weight: 15 });
    else if (mc.prevHist >= 0 && mc.hist < 0) out.push({ family: "tech", key: "macd", label: "MACD bearish crossover", direction: "avoid", weight: 15 });
  }

  const s50 = sma(c, 50);
  const s200 = sma(c, 200);
  if (Number.isFinite(s50) && Number.isFinite(last)) {
    if (last > s50) out.push({ family: "tech", key: "sma50", label: `Price above 50-DMA (${s50.toFixed(2)})`, direction: "buy", weight: 8 });
    else out.push({ family: "tech", key: "sma50", label: `Price below 50-DMA (${s50.toFixed(2)})`, direction: "avoid", weight: 8 });
  }
  if (Number.isFinite(s200) && Number.isFinite(last)) {
    if (last > s200) out.push({ family: "tech", key: "sma200", label: `Uptrend — price above 200-DMA (${s200.toFixed(2)})`, direction: "buy", weight: 10 });
    else out.push({ family: "tech", key: "sma200", label: `Downtrend — price below 200-DMA (${s200.toFixed(2)})`, direction: "avoid", weight: 10 });
  }

  // --- fundamentals ---
  const f = input.fundamentals ?? undefined;
  const pe = f?.trailingPE ?? f?.forwardPE;
  if (pe && f?.peFiveYearMedian) {
    const ratio = pe / f.peFiveYearMedian;
    if (ratio < 0.85) out.push({ family: "fund", key: "pe-vs-history", label: `P/E ${pe.toFixed(1)} vs 5y median ${f.peFiveYearMedian.toFixed(1)} — discount`, direction: "buy", weight: 12 });
    else if (ratio > 1.15) out.push({ family: "fund", key: "pe-vs-history", label: `P/E ${pe.toFixed(1)} vs 5y median ${f.peFiveYearMedian.toFixed(1)} — premium`, direction: "avoid", weight: 8 });
  }
  if (input.daysSinceEarnings != null && input.daysSinceEarnings <= 10 && input.postEarningsGap != null && input.postEarningsGap <= -0.03) {
    out.push({ family: "fund", key: "post-earnings-dip", label: `Post-earnings dip ${(input.postEarningsGap * 100).toFixed(1)}% within ${input.daysSinceEarnings}d`, direction: "buy", weight: 15 });
  }

  // --- macro proximity ---
  if (input.daysToEarnings != null && input.daysToEarnings <= 14) {
    out.push({ family: "macro", key: "earnings-soon", label: `Earnings in ${input.daysToEarnings}d — event risk window`, direction: "wait", weight: 10, note: "Consider staggering entry until after the print." });
  }
  if (input.daysToPolicy != null && input.daysToPolicy <= 21) {
    out.push({ family: "macro", key: "policy-window", label: `Policy decision in ${input.daysToPolicy}d`, direction: "wait", weight: 6 });
  }
  if (input.daysToCpi != null && input.daysToCpi <= 10) {
    out.push({ family: "macro", key: "cpi-window", label: `CPI print in ${input.daysToCpi}d`, direction: "wait", weight: 4 });
  }

  return out;
}

export function summarize(symbol: string, signals: TimingSignal[]): Pick<TimingResult, "verdict" | "score" | "headline"> {
  const { score, verdict } = scoreSignals(signals);
  const top = [...signals].sort((a, b) => b.weight - a.weight).slice(0, 2).map((s) => s.label);
  const headline = verdict === "buy"
    ? `${symbol}: entry window is open — ${top.join("; ")}.`
    : verdict === "avoid"
      ? `${symbol}: unfavourable entry — ${top.join("; ")}.`
      : `${symbol}: hold off for a cleaner setup — ${top.join("; ")}.`;
  return { verdict, score, headline };
}