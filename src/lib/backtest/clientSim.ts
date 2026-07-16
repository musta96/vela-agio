// Client-side port of the edge-function `simulate` for CUSTOM rule-based strategies.
// Kept in sync with supabase/functions/backtest-strategy/index.ts. Used by the
// sensitivity heatmap and regime breakdown so we can scan parameters locally
// without hammering the edge function.

import type { Condition, RiskConfig } from "@/lib/ta/strategyTypes";
import type { CostConfig } from "./costs";

export interface Bar { t: number; close: number; }
export interface SimTrade { t: number; date: string; type: "BUY" | "SELL"; price: number; shares: number; }
export interface SimResult {
  equity: { t: number; value: number }[];
  trades: SimTrade[];
  metrics: {
    totalReturn: number;
    maxDrawdown: number;
    sharpe: number;
    winRate: number;
    totalTrades: number;
  };
}

function sma(arr: number[], n: number, i: number): number | null {
  if (i + 1 < n) return null;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) s += arr[k];
  return s / n;
}

function rsi(closes: number[], i: number, period = 14): number | null {
  if (i < period) return null;
  let g = 0, l = 0;
  for (let k = i - period + 1; k <= i; k++) {
    const d = closes[k] - closes[k - 1];
    if (d >= 0) g += d; else l -= d;
  }
  const avgG = g / period, avgL = l / period;
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}

function evalCondition(c: Condition, closes: number[], i: number): boolean {
  switch (c.type) {
    case "rsi_below": { const r = rsi(closes, i); return r !== null && r < (c.value ?? 30); }
    case "rsi_above": { const r = rsi(closes, i); return r !== null && r > (c.value ?? 70); }
    case "sma_cross_up": {
      const f = c.fast ?? 20, s = c.slow ?? 50;
      const a = sma(closes, f, i), b = sma(closes, s, i);
      const ap = sma(closes, f, i - 1), bp = sma(closes, s, i - 1);
      return !!(a && b && ap && bp && ap <= bp && a > b);
    }
    case "sma_cross_down": {
      const f = c.fast ?? 20, s = c.slow ?? 50;
      const a = sma(closes, f, i), b = sma(closes, s, i);
      const ap = sma(closes, f, i - 1), bp = sma(closes, s, i - 1);
      return !!(a && b && ap && bp && ap >= bp && a < b);
    }
    case "price_above_sma": { const v = sma(closes, c.period ?? 50, i); return v !== null && closes[i] > v; }
    case "price_below_sma": { const v = sma(closes, c.period ?? 50, i); return v !== null && closes[i] < v; }
    case "price_pct_change": {
      const n = c.period ?? 5;
      if (i - n < 0) return false;
      const chg = ((closes[i] - closes[i - n]) / closes[i - n]) * 100;
      const thr = c.value ?? 5;
      return thr >= 0 ? chg >= thr : chg <= thr;
    }
    default: return false;
  }
}

export function simulateCustom(
  bars: Bar[],
  rules: { entry: Condition[]; exit: Condition[]; risk: RiskConfig },
  initial: number,
  costs: CostConfig = {},
): SimResult {
  const closes = bars.map((b) => b.close);
  let cash = initial, shares = 0;
  const equity: { t: number; value: number }[] = [];
  const trades: SimTrade[] = [];
  const slipMult = 1 + Math.max(0, costs.slippageBps ?? 0) / 10000;
  const feePctFrac = Math.max(0, costs.commissionPct ?? 0) / 100;
  const feeFlat = Math.max(0, costs.commissionFlat ?? 0);
  let entryPrice = 0;

  const buy = (i: number) => {
    if (shares > 0 || cash <= 0) return;
    const exec = closes[i] * slipMult;
    const spendable = Math.max(0, cash - feeFlat);
    const s = spendable / (exec * (1 + feePctFrac));
    if (s <= 0) return;
    shares = s; cash = 0; entryPrice = exec;
    trades.push({ t: bars[i].t, date: new Date(bars[i].t).toISOString().slice(0, 10), type: "BUY", price: exec, shares });
  };
  const sell = (i: number) => {
    if (shares <= 0) return;
    const exec = closes[i] * (2 - slipMult);
    const gross = shares * exec;
    const fee = feeFlat + gross * feePctFrac;
    cash = Math.max(0, gross - fee);
    trades.push({ t: bars[i].t, date: new Date(bars[i].t).toISOString().slice(0, 10), type: "SELL", price: exec, shares });
    shares = 0;
  };

  for (let i = 0; i < bars.length; i++) {
    if (shares > 0) {
      const chg = ((closes[i] - entryPrice) / entryPrice) * 100;
      if (rules.risk?.stopPct && chg <= -Math.abs(rules.risk.stopPct)) sell(i);
      else if (rules.risk?.targetPct && chg >= Math.abs(rules.risk.targetPct)) sell(i);
    }
    if (shares === 0) {
      if (rules.entry.length > 0 && rules.entry.every((c) => evalCondition(c, closes, i))) buy(i);
    } else if (rules.exit.length > 0 && rules.exit.every((c) => evalCondition(c, closes, i))) {
      sell(i);
    }
    equity.push({ t: bars[i].t, value: cash + shares * closes[i] });
  }
  if (shares > 0) sell(bars.length - 1);

  const finalValue = equity[equity.length - 1]?.value ?? initial;
  const totalReturn = ((finalValue - initial) / initial) * 100;
  let peak = equity[0]?.value ?? initial, maxDD = 0;
  for (const e of equity) {
    if (e.value > peak) peak = e.value;
    const dd = ((e.value - peak) / peak) * 100;
    if (dd < maxDD) maxDD = dd;
  }
  const rets: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1].value;
    if (prev > 0) rets.push((equity[i].value - prev) / prev);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const std = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1));
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;

  let wins = 0, pairs = 0;
  for (let i = 0; i < trades.length - 1; i += 2) {
    if (trades[i].type === "BUY" && trades[i + 1]?.type === "SELL") {
      pairs++;
      if (trades[i + 1].price > trades[i].price) wins++;
    }
  }
  const winRate = pairs > 0 ? (wins / pairs) * 100 : 0;

  return {
    equity, trades,
    metrics: { totalReturn, maxDrawdown: maxDD, sharpe, winRate, totalTrades: trades.length },
  };
}