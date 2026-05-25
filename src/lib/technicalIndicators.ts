// Technical analysis indicators + pattern detection.
// All functions are pure and operate on OHLC bars or close arrays.

export interface OHLCBar {
  t: number; // ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// ---------- Moving Averages ----------
export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let seed = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      seed += values[i];
      out.push(null);
    } else if (i === period - 1) {
      seed += values[i];
      prev = seed / period;
      out.push(prev);
    } else {
      prev = values[i] * k + (prev as number) * (1 - k);
      out.push(prev);
    }
  }
  return out;
}

// ---------- RSI (Wilder's) ----------
export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = 100 - 100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = 100 - 100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss));
  }
  return out;
}

// ---------- MACD ----------
export interface MACDPoint {
  macd: number | null;
  signal: number | null;
  hist: number | null;
}
export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): MACDPoint[] {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = closes.map((_, i) => {
    const f = emaFast[i];
    const s = emaSlow[i];
    return f != null && s != null ? f - s : null;
  });
  // Build signal EMA only from defined macd points
  const defined = macdLine.map((v) => (v == null ? 0 : v));
  const firstIdx = macdLine.findIndex((v) => v != null);
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  if (firstIdx >= 0) {
    const slice = defined.slice(firstIdx);
    const sig = ema(slice, signalPeriod);
    sig.forEach((v, i) => (signalLine[firstIdx + i] = v));
  }
  return closes.map((_, i) => ({
    macd: macdLine[i],
    signal: signalLine[i],
    hist:
      macdLine[i] != null && signalLine[i] != null
        ? (macdLine[i] as number) - (signalLine[i] as number)
        : null,
  }));
}

// ---------- Bollinger Bands ----------
export interface BollingerPoint {
  mid: number | null;
  upper: number | null;
  lower: number | null;
}
export function bollinger(
  closes: number[],
  period = 20,
  mult = 2
): BollingerPoint[] {
  const mid = sma(closes, period);
  return closes.map((_, i) => {
    const m = mid[i];
    if (m == null) return { mid: null, upper: null, lower: null };
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += (closes[j] - m) ** 2;
    const sd = Math.sqrt(sq / period);
    return { mid: m, upper: m + mult * sd, lower: m - mult * sd };
  });
}

// ---------- ATR (Wilder) ----------
export function atr(bars: OHLCBar[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length < period + 1) return out;
  const trs: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      trs.push(bars[i].high - bars[i].low);
    } else {
      const h = bars[i].high;
      const l = bars[i].low;
      const pc = bars[i - 1].close;
      trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
  }
  let prev = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < bars.length; i++) {
    prev = (prev * (period - 1) + trs[i]) / period;
    out[i] = prev;
  }
  return out;
}

// ---------- Support / Resistance via swing pivots ----------
export interface PivotLevel {
  price: number;
  type: "support" | "resistance";
  index: number;
}
export function pivotLevels(bars: OHLCBar[], left = 3, right = 3): PivotLevel[] {
  const levels: PivotLevel[] = [];
  for (let i = left; i < bars.length - right; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (bars[j].high >= h) isHigh = false;
      if (bars[j].low <= l) isLow = false;
    }
    if (isHigh) levels.push({ price: h, type: "resistance", index: i });
    if (isLow) levels.push({ price: l, type: "support", index: i });
  }
  return levels;
}

// Cluster nearby pivot prices and return strongest distinct levels
export function consolidatedLevels(
  bars: OHLCBar[],
  tolerancePct = 1.5,
  maxLevels = 6
): { price: number; type: "support" | "resistance"; touches: number }[] {
  const pivots = pivotLevels(bars);
  const clusters: { prices: number[]; type: "support" | "resistance" }[] = [];
  pivots.forEach((p) => {
    const c = clusters.find(
      (cl) =>
        cl.type === p.type &&
        Math.abs(cl.prices[0] - p.price) / cl.prices[0] * 100 < tolerancePct
    );
    if (c) c.prices.push(p.price);
    else clusters.push({ prices: [p.price], type: p.type });
  });
  return clusters
    .map((c) => ({
      price: c.prices.reduce((a, b) => a + b, 0) / c.prices.length,
      type: c.type,
      touches: c.prices.length,
    }))
    .sort((a, b) => b.touches - a.touches)
    .slice(0, maxLevels);
}

// ---------- Candlestick patterns (last bar) ----------
export type CandlePattern =
  | "Bullish Engulfing"
  | "Bearish Engulfing"
  | "Hammer"
  | "Shooting Star"
  | "Doji"
  | "Morning Star"
  | "Evening Star";

export function detectPatterns(bars: OHLCBar[]): CandlePattern[] {
  const out: CandlePattern[] = [];
  const n = bars.length;
  if (n < 3) return out;
  const b = bars[n - 1];
  const p = bars[n - 2];
  const pp = bars[n - 3];
  const body = Math.abs(b.close - b.open);
  const range = b.high - b.low || 1;
  const upper = b.high - Math.max(b.close, b.open);
  const lower = Math.min(b.close, b.open) - b.low;

  // Doji
  if (body / range < 0.1) out.push("Doji");

  // Hammer (bullish reversal)
  if (lower > 2 * body && upper < body && b.close > b.open) out.push("Hammer");

  // Shooting Star (bearish reversal)
  if (upper > 2 * body && lower < body && b.close < b.open)
    out.push("Shooting Star");

  // Engulfing
  const pBody = Math.abs(p.close - p.open);
  if (
    p.close < p.open &&
    b.close > b.open &&
    b.close > p.open &&
    b.open < p.close &&
    body > pBody
  )
    out.push("Bullish Engulfing");
  if (
    p.close > p.open &&
    b.close < b.open &&
    b.open > p.close &&
    b.close < p.open &&
    body > pBody
  )
    out.push("Bearish Engulfing");

  // Morning / Evening star (3-bar)
  const ppBody = Math.abs(pp.close - pp.open);
  const pSmall = pBody < ppBody * 0.5;
  if (
    pp.close < pp.open &&
    pSmall &&
    b.close > b.open &&
    b.close > (pp.open + pp.close) / 2
  )
    out.push("Morning Star");
  if (
    pp.close > pp.open &&
    pSmall &&
    b.close < b.open &&
    b.close < (pp.open + pp.close) / 2
  )
    out.push("Evening Star");

  return out;
}

// ---------- Trend & signal summary ----------
export type Signal = "bullish" | "bearish" | "neutral";

export interface IndicatorSignal {
  name: string;
  value: string;
  signal: Signal;
  reason: string;
}

export interface AnalysisSummary {
  overall: Signal;
  score: number; // -100..100
  signals: IndicatorSignal[];
  patterns: CandlePattern[];
  levels: { price: number; type: "support" | "resistance"; touches: number }[];
  lastClose: number;
}

export function analyze(bars: OHLCBar[]): AnalysisSummary | null {
  if (bars.length < 60) return null;
  const closes = bars.map((b) => b.close);
  const last = closes[closes.length - 1];
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const rsiArr = rsi(closes, 14);
  const macdArr = macd(closes);
  const bb = bollinger(closes, 20, 2);
  const atrArr = atr(bars, 14);

  const sigs: IndicatorSignal[] = [];
  let score = 0;

  // Trend via SMA50/200 (golden / death cross-ish)
  const s50 = sma50[sma50.length - 1];
  const s200 = sma200[sma200.length - 1];
  if (s50 != null && s200 != null) {
    if (s50 > s200 && last > s50) {
      sigs.push({
        name: "Trend (SMA 50/200)",
        value: `Price ${last.toFixed(2)} > SMA50 ${s50.toFixed(2)} > SMA200 ${s200.toFixed(2)}`,
        signal: "bullish",
        reason: "Uptrend: short MA above long MA, price above both.",
      });
      score += 25;
    } else if (s50 < s200 && last < s50) {
      sigs.push({
        name: "Trend (SMA 50/200)",
        value: `Price ${last.toFixed(2)} < SMA50 ${s50.toFixed(2)} < SMA200 ${s200.toFixed(2)}`,
        signal: "bearish",
        reason: "Downtrend: short MA below long MA, price below both.",
      });
      score -= 25;
    } else {
      sigs.push({
        name: "Trend (SMA 50/200)",
        value: `SMA50 ${s50.toFixed(2)} / SMA200 ${s200.toFixed(2)}`,
        signal: "neutral",
        reason: "Mixed trend signals.",
      });
    }
  }

  // SMA20 momentum
  const s20 = sma20[sma20.length - 1];
  const s20prev = sma20[sma20.length - 6] ?? null;
  if (s20 != null && s20prev != null) {
    const slope = ((s20 - s20prev) / s20prev) * 100;
    sigs.push({
      name: "Short-term momentum (SMA20 slope)",
      value: `${slope.toFixed(2)}% over 5 bars`,
      signal: slope > 0.5 ? "bullish" : slope < -0.5 ? "bearish" : "neutral",
      reason:
        slope > 0.5
          ? "20-period MA is sloping up."
          : slope < -0.5
          ? "20-period MA is sloping down."
          : "Flat short-term MA.",
    });
    if (slope > 0.5) score += 10;
    else if (slope < -0.5) score -= 10;
  }

  // RSI
  const r = rsiArr[rsiArr.length - 1];
  if (r != null) {
    let sig: Signal = "neutral";
    let reason = "RSI in neutral zone (40–60).";
    if (r > 70) {
      sig = "bearish";
      reason = "Overbought — pullback risk.";
      score -= 15;
    } else if (r < 30) {
      sig = "bullish";
      reason = "Oversold — bounce potential.";
      score += 15;
    } else if (r > 55) {
      sig = "bullish";
      reason = "RSI above midline — buyers in control.";
      score += 5;
    } else if (r < 45) {
      sig = "bearish";
      reason = "RSI below midline — sellers in control.";
      score -= 5;
    }
    sigs.push({ name: "RSI (14)", value: r.toFixed(1), signal: sig, reason });
  }

  // MACD
  const m = macdArr[macdArr.length - 1];
  const mPrev = macdArr[macdArr.length - 2];
  if (m?.macd != null && m?.signal != null && mPrev?.macd != null && mPrev?.signal != null) {
    const cross =
      mPrev.macd < mPrev.signal && m.macd > m.signal
        ? "bullish cross"
        : mPrev.macd > mPrev.signal && m.macd < m.signal
        ? "bearish cross"
        : null;
    let sig: Signal = m.macd > m.signal ? "bullish" : "bearish";
    let reason = `MACD ${m.macd.toFixed(3)} vs signal ${m.signal.toFixed(3)}.`;
    if (cross === "bullish cross") {
      reason = "Fresh bullish MACD crossover.";
      score += 15;
    } else if (cross === "bearish cross") {
      reason = "Fresh bearish MACD crossover.";
      score -= 15;
    } else if (sig === "bullish") score += 5;
    else score -= 5;
    sigs.push({ name: "MACD (12,26,9)", value: `hist ${m.hist!.toFixed(3)}`, signal: sig, reason });
  }

  // Bollinger
  const bbLast = bb[bb.length - 1];
  if (bbLast.upper != null && bbLast.lower != null) {
    let sig: Signal = "neutral";
    let reason = "Price within Bollinger Bands.";
    if (last >= bbLast.upper) {
      sig = "bearish";
      reason = "Touching upper band — stretched to the upside.";
      score -= 5;
    } else if (last <= bbLast.lower) {
      sig = "bullish";
      reason = "Touching lower band — stretched to the downside.";
      score += 5;
    }
    sigs.push({
      name: "Bollinger Bands (20, 2σ)",
      value: `${bbLast.lower.toFixed(2)} – ${bbLast.upper.toFixed(2)}`,
      signal: sig,
      reason,
    });
  }

  // Volatility (ATR)
  const a = atrArr[atrArr.length - 1];
  if (a != null) {
    sigs.push({
      name: "ATR (14)",
      value: a.toFixed(2),
      signal: "neutral",
      reason: `Average true range ≈ ${((a / last) * 100).toFixed(2)}% of price.`,
    });
  }

  const patterns = detectPatterns(bars);
  patterns.forEach((p) => {
    const bullish = ["Bullish Engulfing", "Hammer", "Morning Star"].includes(p);
    const bearish = ["Bearish Engulfing", "Shooting Star", "Evening Star"].includes(p);
    if (bullish) score += 10;
    if (bearish) score -= 10;
  });

  const levels = consolidatedLevels(bars);

  score = Math.max(-100, Math.min(100, score));
  const overall: Signal = score > 15 ? "bullish" : score < -15 ? "bearish" : "neutral";

  return { overall, score, signals: sigs, patterns, levels, lastClose: last };
}