// Client-side custom-strategy simulator. It intentionally mirrors the server
// backtest evaluator and accepts OHLCV so advanced TA rules are executable.
import type { Condition, RiskConfig } from "@/lib/ta/strategyTypes";
import type { CostConfig } from "./costs";
import { detectCandlestickPatterns } from "@/lib/ta/candlesticks";
import { supportResistance, findTrendlines } from "@/lib/ta/structure";
import { detectOrderBlocks } from "@/lib/ta/smc";
import { detectSweeps } from "@/lib/ta/sweeps";
import { computeFibonacci } from "@/lib/ta/fib";
import { computeAVWAP } from "@/lib/ta/avwap";
import { computeVolumeProfile } from "@/lib/ta/volumeProfile";

export interface Bar { t: number; open?: number; high?: number; low?: number; close: number; volume?: number; }
export interface SimTrade { t: number; date: string; type: "BUY" | "SELL"; price: number; shares: number; }
export interface SimResult {
  equity: { t: number; value: number }[];
  trades: SimTrade[];
  metrics: { totalReturn: number; maxDrawdown: number; sharpe: number; winRate: number; totalTrades: number };
}

const openOf = (b: Bar) => b.open ?? b.close;
const highOf = (b: Bar) => b.high ?? b.close;
const lowOf = (b: Bar) => b.low ?? b.close;
const volumeOf = (b: Bar) => b.volume && b.volume > 0 ? b.volume : 1;

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
  for (let k = i - period + 1; k <= i; k++) { const d = closes[k] - closes[k - 1]; if (d >= 0) gains += d; else losses -= d; }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}
function atr(bars: Bar[], i: number, period = 14): number | null {
  if (i < period) return null;
  let total = 0;
  for (let k = i - period + 1; k <= i; k++) {
    const prev = k > 0 ? bars[k - 1].close : bars[k].close;
    total += Math.max(highOf(bars[k]) - lowOf(bars[k]), Math.abs(highOf(bars[k]) - prev), Math.abs(lowOf(bars[k]) - prev));
  }
  return total / period;
}
function adx(bars: Bar[], i: number, period = 14): number | null {
  if (i < period * 2) return null;
  const dx: number[] = [];
  for (let end = period; end <= i; end++) {
    let tr = 0, plus = 0, minus = 0;
    for (let k = end - period + 1; k <= end; k++) {
      const prev = bars[k - 1]?.close ?? bars[k].close;
      tr += Math.max(highOf(bars[k]) - lowOf(bars[k]), Math.abs(highOf(bars[k]) - prev), Math.abs(lowOf(bars[k]) - prev));
      plus += Math.max(0, highOf(bars[k]) - highOf(bars[k - 1] ?? bars[k]));
      minus += Math.max(0, lowOf(bars[k - 1] ?? bars[k]) - lowOf(bars[k]));
    }
    const p = tr ? plus / tr : 0, m = tr ? minus / tr : 0;
    dx.push(p + m ? Math.abs(p - m) / (p + m) * 100 : 0);
  }
  return dx.length >= period ? dx.slice(-period).reduce((a, b) => a + b, 0) / period : null;
}

function evalCondition(c: Condition, bars: Bar[], i: number): boolean {
  const closes = bars.map((b) => b.close);
  const prior = (n: number) => i - n >= 0;
  switch (c.type) {
    case "rsi_below": { const v = rsi(closes, i); return v !== null && v < (c.value ?? 30); }
    case "rsi_above": { const v = rsi(closes, i); return v !== null && v > (c.value ?? 70); }
    case "sma_cross_up": { const f = c.fast ?? 20, s = c.slow ?? 50; const a = sma(closes, f, i), b = sma(closes, s, i), ap = sma(closes, f, i - 1), bp = sma(closes, s, i - 1); return !!(a !== null && b !== null && ap !== null && bp !== null && ap <= bp && a > b); }
    case "sma_cross_down": { const f = c.fast ?? 20, s = c.slow ?? 50; const a = sma(closes, f, i), b = sma(closes, s, i), ap = sma(closes, f, i - 1), bp = sma(closes, s, i - 1); return !!(a !== null && b !== null && ap !== null && bp !== null && ap >= bp && a < b); }
    case "price_above_sma": { const v = sma(closes, c.period ?? 50, i); return v !== null && closes[i] > v; }
    case "price_below_sma": { const v = sma(closes, c.period ?? 50, i); return v !== null && closes[i] < v; }
    case "ema_cross_up": { const f = c.fast ?? 12, s = c.slow ?? 26; const a = ema(closes, f, i), b = ema(closes, s, i), ap = ema(closes, f, i - 1), bp = ema(closes, s, i - 1); return !!(a !== null && b !== null && ap !== null && bp !== null && ap <= bp && a > b); }
    case "ema_cross_down": { const f = c.fast ?? 12, s = c.slow ?? 26; const a = ema(closes, f, i), b = ema(closes, s, i), ap = ema(closes, f, i - 1), bp = ema(closes, s, i - 1); return !!(a !== null && b !== null && ap !== null && bp !== null && ap >= bp && a < b); }
    case "price_pct_change": { const n = c.period ?? 5; if (!prior(n) || closes[i - n] === 0) return false; const change = (closes[i] - closes[i - n]) / closes[i - n] * 100; return (c.value ?? 5) >= 0 ? change >= (c.value ?? 5) : change <= (c.value ?? 5); }
    case "volume_spike": { const n = 20; const avg = sma(bars.map(volumeOf), n, i - 1); return avg !== null && volumeOf(bars[i]) > (c.value ?? 2) * avg; }
    case "atr_breakout": { const a = atr(bars, i); return a !== null && highOf(bars[i]) - lowOf(bars[i]) > (c.value ?? 1.5) * a; }
    case "adx_above": { const v = adx(bars, i); return v !== null && v > (c.value ?? 25); }
    case "candlestick_pattern": { const hits = detectCandlestickPatterns(bars.slice(0, i + 1)); return hits.some((h) => h.index === i && (!c.pattern || c.pattern === "Any" || h.name === c.pattern)); }
    case "support_reclaim": {
      if (i < 8) return false; const zones = supportResistance(bars.slice(0, i + 1)); const z = zones.filter((x) => x.type === "support").sort((a, b) => Math.abs(a.price - closes[i]) - Math.abs(b.price - closes[i]))[0];
      return !!z && closes[i - 1] < z.price && closes[i] >= z.price && Math.abs(closes[i] - z.price) / z.price * 100 <= (c.value ?? 1.5);
    }
    case "resistance_rejection": {
      if (i < 8) return false; const zones = supportResistance(bars.slice(0, i + 1)); const z = zones.filter((x) => x.type === "resistance").sort((a, b) => Math.abs(a.price - closes[i]) - Math.abs(b.price - closes[i]))[0];
      return !!z && highOf(bars[i]) >= z.price && closes[i] < z.price && Math.abs(closes[i] - z.price) / z.price * 100 <= (c.value ?? 1.5);
    }
    case "liquidity_sweep_bullish": return detectSweeps(bars.slice(0, i + 1), { lookback: c.period ?? 40 }).some((s) => s.index === i && s.bias === "bullish" && s.reclaimed);
    case "liquidity_sweep_bearish": return detectSweeps(bars.slice(0, i + 1), { lookback: c.period ?? 40 }).some((s) => s.index === i && s.bias === "bearish" && s.reclaimed);
    case "order_block_touch_bullish": { const obs = detectOrderBlocks(bars.slice(0, i + 1)); return obs.some((o) => o.index < i && o.bias === "bullish" && lowOf(bars[i]) <= o.top && highOf(bars[i]) >= o.bottom && i - o.index <= (c.period ?? 60)); }
    case "order_block_touch_bearish": { const obs = detectOrderBlocks(bars.slice(0, i + 1)); return obs.some((o) => o.index < i && o.bias === "bearish" && lowOf(bars[i]) <= o.top && highOf(bars[i]) >= o.bottom && i - o.index <= (c.period ?? 60)); }
    case "fib_golden_zone": { const fib = computeFibonacci(bars.slice(0, i + 1)); return !!fib && closes[i] >= fib.goldenZone.bottom && closes[i] <= fib.goldenZone.top; }
    case "avwap_cross_up": { const n = c.period ?? 60; if (!prior(1)) return false; const points = computeAVWAP(bars.slice(0, i + 1), Math.max(0, i - n)); const prev = points[i - 1]?.avwap, now = points[i]?.avwap; return prev !== null && now !== null && closes[i - 1] <= (prev ?? 0) && closes[i] > (now ?? 0); }
    case "avwap_cross_down": { const n = c.period ?? 60; if (!prior(1)) return false; const points = computeAVWAP(bars.slice(0, i + 1), Math.max(0, i - n)); const prev = points[i - 1]?.avwap, now = points[i]?.avwap; return prev !== null && now !== null && closes[i - 1] >= (prev ?? 0) && closes[i] < (now ?? 0); }
    case "volume_profile_above_poc": { const w = Math.min(i + 1, c.period ?? 60); const p = computeVolumeProfile(bars.slice(i + 1 - w, i + 1)); return !!p && closes[i] > p.poc; }
    case "volume_profile_below_poc": { const w = Math.min(i + 1, c.period ?? 60); const p = computeVolumeProfile(bars.slice(i + 1 - w, i + 1)); return !!p && closes[i] < p.poc; }
    case "trendline_break_up": return findTrendlines(bars.slice(0, i + 1)).some((t) => t.kind === "down" && t.broken?.index === i);
    case "trendline_break_down": return findTrendlines(bars.slice(0, i + 1)).some((t) => t.kind === "up" && t.broken?.index === i);
    case "avwap_sweep_reclaim": {
      const n = c.period ?? 40; const prefix = bars.slice(0, i + 1); const sweeps = detectSweeps(prefix, { lookback: n }); const s = sweeps.find((x) => x.index === i && x.reclaimed); if (!s) return false;
      const points = computeAVWAP(prefix, Math.max(0, i - n)); const v = points[i]?.avwap; return v !== null && v !== undefined && Math.abs(closes[i] - v) / v * 100 <= (c.value ?? 1.5);
    }
    default: return false;
  }
}

export function simulateCustom(bars: Bar[], rules: { entry: Condition[]; exit: Condition[]; risk: RiskConfig }, initial: number, costs: CostConfig = {}): SimResult {
  if (!bars.length) return { equity: [], trades: [], metrics: { totalReturn: 0, maxDrawdown: 0, sharpe: 0, winRate: 0, totalTrades: 0 } };
  let cash = initial, shares = 0, entryPrice = 0;
  const equity: { t: number; value: number }[] = [], trades: SimTrade[] = [];
  const slip = 1 + Math.max(0, costs.slippageBps ?? 0) / 10000;
  const feePct = Math.max(0, costs.commissionPct ?? 0) / 100, flat = Math.max(0, costs.commissionFlat ?? 0);
  const buy = (i: number) => { if (shares > 0 || cash <= 0) return; const exec = bars[i].close * slip; const spend = Math.max(0, cash - flat); shares = spend / (exec * (1 + feePct)); cash = 0; entryPrice = exec; trades.push({ t: bars[i].t, date: new Date(bars[i].t).toISOString().slice(0, 10), type: "BUY", price: exec, shares }); };
  const sell = (i: number) => { if (shares <= 0) return; const exec = bars[i].close * (2 - slip); cash = Math.max(0, shares * exec - flat - shares * exec * feePct); trades.push({ t: bars[i].t, date: new Date(bars[i].t).toISOString().slice(0, 10), type: "SELL", price: exec, shares }); shares = 0; };
  for (let i = 0; i < bars.length; i++) {
    if (shares > 0) { const chg = (bars[i].close - entryPrice) / entryPrice * 100; if (rules.risk.stopPct && chg <= -Math.abs(rules.risk.stopPct)) sell(i); else if (rules.risk.targetPct && chg >= Math.abs(rules.risk.targetPct)) sell(i); }
    if (shares === 0 && rules.entry.length && rules.entry.every((c) => evalCondition(c, bars, i))) buy(i);
    else if (shares > 0 && rules.exit.length && rules.exit.every((c) => evalCondition(c, bars, i))) sell(i);
    equity.push({ t: bars[i].t, value: cash + shares * bars[i].close });
  }
  if (shares > 0) sell(bars.length - 1);
  const finalValue = equity[equity.length - 1]?.value ?? initial;
  let peak = equity[0]?.value ?? initial, maxDrawdown = 0;
  for (const p of equity) { peak = Math.max(peak, p.value); maxDrawdown = Math.min(maxDrawdown, peak ? (p.value - peak) / peak * 100 : 0); }
  const returns = equity.slice(1).map((p, i) => equity[i].value ? (p.value - equity[i].value) / equity[i].value : 0);
  const avg = returns.reduce((a, b) => a + b, 0) / (returns.length || 1); const sd = Math.sqrt(returns.reduce((a, b) => a + (b - avg) ** 2, 0) / (returns.length || 1));
  let wins = 0, pairs = 0; for (let i = 0; i + 1 < trades.length; i += 2) { if (trades[i].type === "BUY" && trades[i + 1].type === "SELL") { pairs++; if (trades[i + 1].price > trades[i].price) wins++; } }
  return { equity, trades, metrics: { totalReturn: (finalValue - initial) / initial * 100, maxDrawdown, sharpe: sd ? avg / sd * Math.sqrt(252) : 0, winRate: pairs ? wins / pairs * 100 : 0, totalTrades: trades.length } };
}
