// Top-Down (multi-timeframe) analysis helpers.
import type { Bar, Bias } from "./types";
import { sma, ema, rsi, macd } from "../technicalIndicators";
import { supportResistance } from "./structure";
import { recentCandlePatterns } from "./candlesticks";

export interface TimeframeScorecard {
  timeframe: string;
  bars: number;
  lastClose: number | null;
  bias: Bias;
  score: number;
  trendLabel: string;
  reasons: string[];
  nearestSupport: number | null;
  nearestResistance: number | null;
  lastPattern?: string;
}

export function scoreTimeframe(timeframe: string, bars: Bar[]): TimeframeScorecard {
  if (bars.length < 20) {
    return {
      timeframe, bars: bars.length, lastClose: bars[bars.length - 1]?.close ?? null,
      bias: "neutral", score: 0, trendLabel: "insufficient data", reasons: [],
      nearestSupport: null, nearestResistance: null,
    };
  }
  const closes = bars.map((b) => b.close);
  const n = closes.length;
  const last = closes[n - 1];
  const s20 = sma(closes, 20)[n - 1];
  const s50 = sma(closes, 50)[n - 1];
  const s200 = sma(closes, 200)[n - 1];
  const e9 = ema(closes, 9)[n - 1];
  const e21 = ema(closes, 21)[n - 1];
  const r = rsi(closes, 14)[n - 1];
  const m = macd(closes)[n - 1];

  let score = 0;
  const reasons: string[] = [];

  if (s50 != null && s200 != null) {
    if (s50 > s200) { score += 25; reasons.push("SMA50 > SMA200 (macro uptrend)"); }
    else { score -= 25; reasons.push("SMA50 < SMA200 (macro downtrend)"); }
  }
  if (s20 != null) {
    if (last > s20) { score += 10; reasons.push("Price above SMA20"); }
    else { score -= 10; reasons.push("Price below SMA20"); }
  }
  if (e9 != null && e21 != null) {
    if (e9 > e21) { score += 10; reasons.push("EMA9 > EMA21"); }
    else { score -= 10; reasons.push("EMA9 < EMA21"); }
  }
  if (r != null) {
    if (r > 70) { score -= 15; reasons.push(`RSI overbought (${r.toFixed(0)})`); }
    else if (r < 30) { score += 15; reasons.push(`RSI oversold (${r.toFixed(0)})`); }
    else if (r > 55) { score += 5; reasons.push(`RSI ${r.toFixed(0)} (bullish momentum)`); }
    else if (r < 45) { score -= 5; reasons.push(`RSI ${r.toFixed(0)} (bearish momentum)`); }
  }
  if (m?.macd != null && m?.signal != null) {
    if (m.macd > m.signal) { score += 10; reasons.push("MACD > signal"); }
    else { score -= 10; reasons.push("MACD < signal"); }
  }
  const patterns = recentCandlePatterns(bars, 3);
  const lastP = patterns[patterns.length - 1];
  if (lastP) {
    if (lastP.bias === "bullish") { score += 8; reasons.push(`Recent bullish candle: ${lastP.name}`); }
    else if (lastP.bias === "bearish") { score -= 8; reasons.push(`Recent bearish candle: ${lastP.name}`); }
  }

  const bias: Bias = score > 15 ? "bullish" : score < -15 ? "bearish" : "neutral";
  const trendLabel =
    score > 40 ? "Strong uptrend"
    : score > 15 ? "Uptrend"
    : score < -40 ? "Strong downtrend"
    : score < -15 ? "Downtrend"
    : "Ranging";

  const sr = supportResistance(bars);
  const supports = sr.filter((z) => z.type === "support" && z.price < last).sort((a, b) => b.price - a.price);
  const resistances = sr.filter((z) => z.type === "resistance" && z.price > last).sort((a, b) => a.price - b.price);

  return {
    timeframe,
    bars: bars.length,
    lastClose: last,
    bias,
    score: Math.max(-100, Math.min(100, score)),
    trendLabel,
    reasons,
    nearestSupport: supports[0]?.price ?? null,
    nearestResistance: resistances[0]?.price ?? null,
    lastPattern: lastP?.name,
  };
}

export interface AlignmentSummary {
  score: number;
  label: string;
  bullish: number;
  bearish: number;
  neutral: number;
}

export function alignmentSummary(cards: TimeframeScorecard[]): AlignmentSummary {
  const bullish = cards.filter((c) => c.bias === "bullish").length;
  const bearish = cards.filter((c) => c.bias === "bearish").length;
  const neutral = cards.filter((c) => c.bias === "neutral").length;
  const total = Math.max(1, cards.length);
  const raw = ((bullish - bearish) / total) * 100;
  let label: string;
  if (bullish === total) label = "Fully aligned bullish";
  else if (bearish === total) label = "Fully aligned bearish";
  else if (bullish >= total - 1 && bearish === 0) label = "Mostly bullish";
  else if (bearish >= total - 1 && bullish === 0) label = "Mostly bearish";
  else if (bullish === bearish) label = "Conflicted";
  else if (bullish > bearish) label = "Leaning bullish";
  else label = "Leaning bearish";
  return { score: Math.round(raw), label, bullish, bearish, neutral };
}
