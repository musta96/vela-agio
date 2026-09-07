// Server-side evaluation of strategy-builder conditions, including the
// advanced pattern rules. Mirrors src/lib/backtest/clientSim.ts so a run
// executed on the server produces the same signals as the client preview.
import type { Bar } from "./types.ts";
import { detectCandlestickPatterns } from "./candlesticks.ts";
import { supportResistance, findTrendlines } from "./structure.ts";
import { detectOrderBlocks } from "./smc.ts";
import { detectSweeps } from "./sweeps.ts";
import { computeFibonacci } from "./fib.ts";
import { computeAVWAP } from "./avwap.ts";
import { computeVolumeProfile } from "./volumeProfile.ts";

export interface StrategyCondition {
  type: string;
  value?: number;
  period?: number;
  fast?: number;
  slow?: number;
  pattern?: string;
}

export const SUPPORTED_CONDITIONS = new Set<string>([
  "rsi_below", "rsi_above",
  "sma_cross_up", "sma_cross_down",
  "price_above_sma", "price_below_sma",
  "macd_cross_up", "macd_cross_down",
  "ema_cross_up", "ema_cross_down",
  "price_pct_change", "volume_spike", "atr_breakout", "adx_above",
  "candlestick_pattern", "support_reclaim", "resistance_rejection",
  "liquidity_sweep_bullish", "liquidity_sweep_bearish",
  "order_block_touch_bullish", "order_block_touch_bearish",
  "fib_golden_zone", "avwap_cross_up", "avwap_cross_down",
  "volume_profile_above_poc", "volume_profile_below_poc",
  "trendline_break_up", "trendline_break_down",
  "avwap_sweep_reclaim",
]);

export function unsupportedConditions(conditions: StrategyCondition[]): string[] {
  return Array.from(new Set(
    conditions.filter((c) => !c || !SUPPORTED_CONDITIONS.has(String(c.type))).map((c) => String(c?.type ?? "unknown")),
  ));
}

// Trailing window used for detector rules: keeps evaluation O(n * WINDOW)
// and, crucially, never lets a detector see bars after the current index.
const WINDOW = 300;

const vol = (b: Bar) => (b.volume && b.volume > 0 ? b.volume : 1);

function sma(values: number[], n: number, i: number): number | null {
  if (n < 1 || i + 1 < n) return null;
  let total = 0;
  for (let k = i - n + 1; k <= i; k++) total += values[k];
  return total / n;
}
function ema(values: number[], n: number, i: number): number | null {
  if (n < 1 || i + 1 < n) return null;
  const k = 2 / (n + 1);
  let value = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let x = n; x <= i; x++) value = values[x] * k + value * (1 - k);
  return value;
}
function rsi(closes: number[], i: number, period = 14): number | null {
  if (i < period) return null;
  let gains = 0, losses = 0;
  for (let k = i - period + 1; k <= i; k++) {
    const d = closes[k] - closes[k - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}
function macdAt(closes: number[], i: number): { macd: number; signal: number } | null {
  const f = ema(closes, 12, i);
  const s = ema(closes, 26, i);
  if (f == null || s == null) return null;
  const line: number[] = [];
  for (let x = 0; x <= i; x++) {
    const ef = ema(closes, 12, x);
    const es = ema(closes, 26, x);
    line.push(ef != null && es != null ? ef - es : 0);
  }
  const sig = ema(line, 9, line.length - 1);
  if (sig == null) return null;
  return { macd: f - s, signal: sig };
}
function atr(bars: Bar[], i: number, period = 14): number | null {
  if (i < period) return null;
  let total = 0;
  for (let k = i - period + 1; k <= i; k++) {
    const prev = k > 0 ? bars[k - 1].close : bars[k].close;
    total += Math.max(bars[k].high - bars[k].low, Math.abs(bars[k].high - prev), Math.abs(bars[k].low - prev));
  }
  return total / period;
}
function adx(bars: Bar[], i: number, period = 14): number | null {
  if (i < period * 2) return null;
  const dx: number[] = [];
  for (let end = i - period + 1; end <= i; end++) {
    let tr = 0, plus = 0, minus = 0;
    for (let k = end - period + 1; k <= end; k++) {
      const prev = bars[k - 1] ?? bars[k];
      tr += Math.max(bars[k].high - bars[k].low, Math.abs(bars[k].high - prev.close), Math.abs(bars[k].low - prev.close));
      plus += Math.max(0, bars[k].high - prev.high);
      minus += Math.max(0, prev.low - bars[k].low);
    }
    const p = tr ? plus / tr : 0, m = tr ? minus / tr : 0;
    dx.push(p + m ? (Math.abs(p - m) / (p + m)) * 100 : 0);
  }
  return dx.length ? dx.reduce((a, b) => a + b, 0) / dx.length : null;
}

export function evalStrategyCondition(c: StrategyCondition, bars: Bar[], i: number): boolean {
  const closes = bars.map((b) => b.close);
  const start = Math.max(0, i - WINDOW + 1);
  const win = bars.slice(start, i + 1);
  const j = win.length - 1; // current index inside the window
  const bar = bars[i];

  switch (c.type) {
    case "rsi_below": { const v = rsi(closes, i); return v !== null && v < (c.value ?? 30); }
    case "rsi_above": { const v = rsi(closes, i); return v !== null && v > (c.value ?? 70); }
    case "sma_cross_up": { const f = c.fast ?? 20, s = c.slow ?? 50; const a = sma(closes, f, i), b = sma(closes, s, i), ap = sma(closes, f, i - 1), bp = sma(closes, s, i - 1); return !!(a !== null && b !== null && ap !== null && bp !== null && ap <= bp && a > b); }
    case "sma_cross_down": { const f = c.fast ?? 20, s = c.slow ?? 50; const a = sma(closes, f, i), b = sma(closes, s, i), ap = sma(closes, f, i - 1), bp = sma(closes, s, i - 1); return !!(a !== null && b !== null && ap !== null && bp !== null && ap >= bp && a < b); }
    case "price_above_sma": { const v = sma(closes, c.period ?? 50, i); return v !== null && closes[i] > v; }
    case "price_below_sma": { const v = sma(closes, c.period ?? 50, i); return v !== null && closes[i] < v; }
    case "ema_cross_up": { const f = c.fast ?? 12, s = c.slow ?? 26; const a = ema(closes, f, i), b = ema(closes, s, i), ap = ema(closes, f, i - 1), bp = ema(closes, s, i - 1); return !!(a !== null && b !== null && ap !== null && bp !== null && ap <= bp && a > b); }
    case "ema_cross_down": { const f = c.fast ?? 12, s = c.slow ?? 26; const a = ema(closes, f, i), b = ema(closes, s, i), ap = ema(closes, f, i - 1), bp = ema(closes, s, i - 1); return !!(a !== null && b !== null && ap !== null && bp !== null && ap >= bp && a < b); }
    case "macd_cross_up": { const m = macdAt(closes, i), mp = macdAt(closes, i - 1); return !!(m && mp && mp.macd <= mp.signal && m.macd > m.signal); }
    case "macd_cross_down": { const m = macdAt(closes, i), mp = macdAt(closes, i - 1); return !!(m && mp && mp.macd >= mp.signal && m.macd < m.signal); }
    case "price_pct_change": { const n = c.period ?? 5; if (i - n < 0 || closes[i - n] === 0) return false; const chg = ((closes[i] - closes[i - n]) / closes[i - n]) * 100; const thr = c.value ?? 5; return thr >= 0 ? chg >= thr : chg <= thr; }
    case "volume_spike": { const avg = sma(bars.map(vol), 20, i - 1); return avg !== null && vol(bar) > (c.value ?? 2) * avg; }
    case "atr_breakout": { const a = atr(bars, i); return a !== null && bar.high - bar.low > (c.value ?? 1.5) * a; }
    case "adx_above": { const v = adx(bars, i); return v !== null && v > (c.value ?? 25); }
    case "candlestick_pattern": {
      const hits = detectCandlestickPatterns(win);
      return hits.some((h) => h.index === j && (!c.pattern || c.pattern === "Any" || h.name === c.pattern));
    }
    case "support_reclaim": {
      if (i < 8) return false;
      const z = supportResistance(win).filter((x) => x.type === "support")
        .sort((a, b) => Math.abs(a.price - closes[i]) - Math.abs(b.price - closes[i]))[0];
      return !!z && closes[i - 1] < z.price && closes[i] >= z.price && (Math.abs(closes[i] - z.price) / z.price) * 100 <= (c.value ?? 1.5);
    }
    case "resistance_rejection": {
      if (i < 8) return false;
      const z = supportResistance(win).filter((x) => x.type === "resistance")
        .sort((a, b) => Math.abs(a.price - closes[i]) - Math.abs(b.price - closes[i]))[0];
      return !!z && bar.high >= z.price && closes[i] < z.price && (Math.abs(closes[i] - z.price) / z.price) * 100 <= (c.value ?? 1.5);
    }
    case "liquidity_sweep_bullish":
      return detectSweeps(win, { lookback: c.period ?? 40 }).some((s) => s.index === j && s.bias === "bullish" && s.reclaimed);
    case "liquidity_sweep_bearish":
      return detectSweeps(win, { lookback: c.period ?? 40 }).some((s) => s.index === j && s.bias === "bearish" && s.reclaimed);
    case "order_block_touch_bullish": {
      const obs = detectOrderBlocks(win);
      return obs.some((o) => o.index < j && o.bias === "bullish" && bar.low <= o.top && bar.high >= o.bottom && j - o.index <= (c.period ?? 60));
    }
    case "order_block_touch_bearish": {
      const obs = detectOrderBlocks(win);
      return obs.some((o) => o.index < j && o.bias === "bearish" && bar.low <= o.top && bar.high >= o.bottom && j - o.index <= (c.period ?? 60));
    }
    case "fib_golden_zone": {
      const fib = computeFibonacci(win);
      return !!fib && closes[i] >= fib.goldenZone.bottom && closes[i] <= fib.goldenZone.top;
    }
    case "avwap_cross_up": {
      if (i < 1) return false;
      const n = c.period ?? 60;
      const pts = computeAVWAP(win, Math.max(0, j - n));
      const prev = pts[j - 1]?.avwap, now = pts[j]?.avwap;
      return prev != null && now != null && closes[i - 1] <= prev && closes[i] > now;
    }
    case "avwap_cross_down": {
      if (i < 1) return false;
      const n = c.period ?? 60;
      const pts = computeAVWAP(win, Math.max(0, j - n));
      const prev = pts[j - 1]?.avwap, now = pts[j]?.avwap;
      return prev != null && now != null && closes[i - 1] >= prev && closes[i] < now;
    }
    case "volume_profile_above_poc": {
      const w = Math.min(j + 1, c.period ?? 60);
      const p = computeVolumeProfile(win.slice(j + 1 - w, j + 1));
      return !!p && closes[i] > p.poc;
    }
    case "volume_profile_below_poc": {
      const w = Math.min(j + 1, c.period ?? 60);
      const p = computeVolumeProfile(win.slice(j + 1 - w, j + 1));
      return !!p && closes[i] < p.poc;
    }
    case "trendline_break_up":
      return findTrendlines(win).some((t) => t.kind === "down" && t.broken?.index === j);
    case "trendline_break_down":
      return findTrendlines(win).some((t) => t.kind === "up" && t.broken?.index === j);
    case "avwap_sweep_reclaim": {
      const n = c.period ?? 40;
      const s = detectSweeps(win, { lookback: n }).find((x) => x.index === j && x.reclaimed);
      if (!s) return false;
      const v = computeAVWAP(win, Math.max(0, j - n))[j]?.avwap;
      return v != null && (Math.abs(closes[i] - v) / v) * 100 <= (c.value ?? 1.5);
    }
    default:
      return false;
  }
}
