// Shared history + simulation helpers used by run_backtest and start_run.
// Kept identical to the original inline logic in run-backtest.ts.

export interface Bar { t: number; close: number }

export type Preset = "buy_hold" | "sma_cross" | "rsi";

export interface BacktestParams {
  fast?: number; slow?: number;
  rsiPeriod?: number; rsiBuy?: number; rsiSell?: number;
  stopPct?: number; targetPct?: number;
}

export async function fetchHistory(symbol: string, range: string): Promise<Bar[]> {
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36";
  const direct = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  for (const url of [direct, `https://api.allorigins.win/raw?url=${encodeURIComponent(direct)}`]) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (!r.ok) continue;
      const j = await r.json();
      const res = j?.chart?.result?.[0];
      const ts: number[] = res?.timestamp ?? [];
      const closes: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? [];
      const bars: Bar[] = [];
      for (let i = 0; i < ts.length; i++) {
        const c = closes[i];
        if (c != null && Number.isFinite(c)) bars.push({ t: ts[i] * 1000, close: c });
      }
      if (bars.length >= 30) return bars;
    } catch { /* try next */ }
  }
  return [];
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

function entrySignal(preset: Preset, closes: number[], i: number, p: BacktestParams): boolean {
  if (preset === "buy_hold") return i === 0;
  if (preset === "sma_cross") {
    const fast = p.fast ?? 20, slow = p.slow ?? 50;
    const a = sma(closes, fast, i), b = sma(closes, slow, i);
    const ap = sma(closes, fast, i - 1), bp = sma(closes, slow, i - 1);
    return !!(a && b && ap && bp && ap <= bp && a > b);
  }
  if (preset === "rsi") {
    const r = rsi(closes, i, p.rsiPeriod ?? 14);
    return r !== null && r < (p.rsiBuy ?? 30);
  }
  return false;
}
function exitSignal(preset: Preset, closes: number[], i: number, p: BacktestParams): boolean {
  if (preset === "buy_hold") return false;
  if (preset === "sma_cross") {
    const fast = p.fast ?? 20, slow = p.slow ?? 50;
    const a = sma(closes, fast, i), b = sma(closes, slow, i);
    const ap = sma(closes, fast, i - 1), bp = sma(closes, slow, i - 1);
    return !!(a && b && ap && bp && ap >= bp && a < b);
  }
  if (preset === "rsi") {
    const r = rsi(closes, i, p.rsiPeriod ?? 14);
    return r !== null && r > (p.rsiSell ?? 70);
  }
  return false;
}

export function simulate(bars: Bar[], preset: Preset, params: BacktestParams, initial: number) {
  const closes = bars.map((b) => b.close);
  let cash = initial, shares = 0, entryPrice = 0;
  const equity: number[] = [];
  const tradeReturns: number[] = [];

  for (let i = 0; i < bars.length; i++) {
    if (shares > 0) {
      const chg = ((closes[i] - entryPrice) / entryPrice) * 100;
      const stop = params.stopPct ? -Math.abs(params.stopPct) : null;
      const target = params.targetPct ? Math.abs(params.targetPct) : null;
      if ((stop !== null && chg <= stop) || (target !== null && chg >= target) || exitSignal(preset, closes, i, params)) {
        cash = shares * closes[i];
        tradeReturns.push((closes[i] - entryPrice) / entryPrice);
        shares = 0;
      }
    } else if (entrySignal(preset, closes, i, params)) {
      shares = cash / closes[i];
      entryPrice = closes[i];
      cash = 0;
    }
    equity.push(cash + shares * closes[i]);
  }
  if (shares > 0) {
    const last = closes[closes.length - 1];
    tradeReturns.push((last - entryPrice) / entryPrice);
    cash = shares * last;
    shares = 0;
  }

  const finalValue = equity[equity.length - 1] ?? initial;
  const totalReturn = (finalValue - initial) / initial;
  const days = bars.length;
  const years = days / 252;
  const cagr = years > 0 ? Math.pow(finalValue / initial, 1 / years) - 1 : 0;

  let peak = equity[0] ?? initial, maxDD = 0;
  for (const v of equity) {
    if (v > peak) peak = v;
    const dd = (v - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }

  const daily: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const p = equity[i - 1];
    if (p > 0) daily.push((equity[i] - p) / p);
  }
  const mean = daily.reduce((a, b) => a + b, 0) / (daily.length || 1);
  const std = Math.sqrt(daily.reduce((a, b) => a + (b - mean) ** 2, 0) / (daily.length || 1));
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;

  const wins = tradeReturns.filter((r) => r > 0).length;
  const hitRate = tradeReturns.length > 0 ? wins / tradeReturns.length : 0;

  return {
    totalReturn: +(totalReturn * 100).toFixed(2),
    cagr: +(cagr * 100).toFixed(2),
    maxDrawdown: +(maxDD * 100).toFixed(2),
    sharpe: +sharpe.toFixed(3),
    hitRate: +(hitRate * 100).toFixed(2),
    totalTrades: tradeReturns.length,
    bars: bars.length,
    finalEquity: +finalValue.toFixed(2),
  };
}