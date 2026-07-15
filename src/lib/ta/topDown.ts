// Top-Down (multi-timeframe) analysis helpers.
import type { Bar, Bias } from "./types";
import { sma, ema, rsi, macd } from "../technicalIndicators";
import { supportResistance } from "./structure";
import { recentCandlePatterns } from "./candlesticks";
import { detectFVGs, detectOrderBlocks, detectLiquidityGrabs } from "./smc";
import { detectStructure } from "./structure";

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
  // Alignment sub-signals (kept separate so the UI can show three columns).
  trendBias: Bias;
  srBias: Bias;      // support proximity => bullish, resistance proximity => bearish
  smcBias: Bias;     // net SMC (OB / FVG / BOS/CHoCH / liquidity grab)
  smcSummary: string;
  srDistancePct: number | null;
}

export function scoreTimeframe(timeframe: string, bars: Bar[]): TimeframeScorecard {
  if (bars.length < 20) {
    return {
      timeframe, bars: bars.length, lastClose: bars[bars.length - 1]?.close ?? null,
      bias: "neutral", score: 0, trendLabel: "insufficient data", reasons: [],
      nearestSupport: null, nearestResistance: null,
      trendBias: "neutral", srBias: "neutral", smcBias: "neutral",
      smcSummary: "—", srDistancePct: null,
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

  // S/R proximity bias: closer to support = bullish setup, closer to resistance = bearish.
  const nearestS = supports[0]?.price ?? null;
  const nearestR = resistances[0]?.price ?? null;
  const distS = nearestS != null ? Math.abs(last - nearestS) / last : Infinity;
  const distR = nearestR != null ? Math.abs(last - nearestR) / last : Infinity;
  const srDistancePct = Math.min(distS, distR) === Infinity ? null : Math.min(distS, distR) * 100;
  let srBias: Bias = "neutral";
  if (distS < distR && distS < 0.03) srBias = "bullish";
  else if (distR < distS && distR < 0.03) srBias = "bearish";
  if (srBias === "bullish") { score += 6; reasons.push(`Price near support (${nearestS!.toFixed(2)})`); }
  if (srBias === "bearish") { score -= 6; reasons.push(`Price near resistance (${nearestR!.toFixed(2)})`); }

  // SMC contribution: fresh OBs, unfilled FVGs, structure shifts, liquidity grabs (recent).
  const obs = detectOrderBlocks(bars);
  const fvgs = detectFVGs(bars).filter((f) => !f.filled);
  const struct = detectStructure(bars);
  const liq = detectLiquidityGrabs(bars);
  const recentIdx = Math.max(0, bars.length - 30);
  const smcBull =
    obs.filter((o) => o.bias === "bullish" && o.index >= recentIdx).length +
    fvgs.filter((f) => f.bias === "bullish" && f.index >= recentIdx).length +
    struct.filter((s) => s.bias === "bullish" && s.index >= recentIdx).length +
    liq.filter((l) => l.bias === "bullish" && l.index >= recentIdx).length;
  const smcBear =
    obs.filter((o) => o.bias === "bearish" && o.index >= recentIdx).length +
    fvgs.filter((f) => f.bias === "bearish" && f.index >= recentIdx).length +
    struct.filter((s) => s.bias === "bearish" && s.index >= recentIdx).length +
    liq.filter((l) => l.bias === "bearish" && l.index >= recentIdx).length;
  let smcBias: Bias = "neutral";
  if (smcBull - smcBear >= 2) { smcBias = "bullish"; score += 8; reasons.push(`SMC skew bullish (${smcBull} vs ${smcBear})`); }
  else if (smcBear - smcBull >= 2) { smcBias = "bearish"; score -= 8; reasons.push(`SMC skew bearish (${smcBear} vs ${smcBull})`); }
  const smcSummary = `${smcBull} bull · ${smcBear} bear (OB/FVG/BOS/LG)`;

  // Recompute overall bias after SR + SMC additions.
  const finalBias: Bias = score > 15 ? "bullish" : score < -15 ? "bearish" : "neutral";
  const finalTrend =
    score > 40 ? "Strong uptrend"
    : score > 15 ? "Uptrend"
    : score < -40 ? "Strong downtrend"
    : score < -15 ? "Downtrend"
    : "Ranging";

  const trendBias: Bias =
    (s50 != null && s200 != null && s50 > s200 && last > (s20 ?? last)) ? "bullish"
    : (s50 != null && s200 != null && s50 < s200 && last < (s20 ?? last)) ? "bearish"
    : "neutral";

  return {
    timeframe,
    bars: bars.length,
    lastClose: last,
    bias: finalBias,
    score: Math.max(-100, Math.min(100, score)),
    trendLabel: finalTrend,
    reasons,
    nearestSupport: nearestS,
    nearestResistance: nearestR,
    lastPattern: lastP?.name,
    trendBias,
    srBias,
    smcBias,
    smcSummary,
    srDistancePct,
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
