import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { withInstrumentation } from "../lib/instrument";

// --- Public Yahoo history fetch (same UA/proxy fallback as get-quote) ------
async function fetchHistory(symbol: string, range: string): Promise<{ t: number; close: number }[]> {
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
      const bars: { t: number; close: number }[] = [];
      for (let i = 0; i < ts.length; i++) {
        const c = closes[i];
        if (c != null && Number.isFinite(c)) bars.push({ t: ts[i] * 1000, close: c });
      }
      if (bars.length >= 30) return bars;
    } catch { /* try next */ }
  }
  return [];
}

// --- Minimal indicators ---------------------------------------------------
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

type Preset = "buy_hold" | "sma_cross" | "rsi";

function entrySignal(preset: Preset, closes: number[], i: number, params: BacktestParams): boolean {
  if (preset === "buy_hold") return i === 0;
  if (preset === "sma_cross") {
    const fast = params.fast ?? 20, slow = params.slow ?? 50;
    const a = sma(closes, fast, i), b = sma(closes, slow, i);
    const ap = sma(closes, fast, i - 1), bp = sma(closes, slow, i - 1);
    return !!(a && b && ap && bp && ap <= bp && a > b);
  }
  if (preset === "rsi") {
    const r = rsi(closes, i, params.rsiPeriod ?? 14);
    return r !== null && r < (params.rsiBuy ?? 30);
  }
  return false;
}
function exitSignal(preset: Preset, closes: number[], i: number, params: BacktestParams): boolean {
  if (preset === "buy_hold") return false;
  if (preset === "sma_cross") {
    const fast = params.fast ?? 20, slow = params.slow ?? 50;
    const a = sma(closes, fast, i), b = sma(closes, slow, i);
    const ap = sma(closes, fast, i - 1), bp = sma(closes, slow, i - 1);
    return !!(a && b && ap && bp && ap >= bp && a < b);
  }
  if (preset === "rsi") {
    const r = rsi(closes, i, params.rsiPeriod ?? 14);
    return r !== null && r > (params.rsiSell ?? 70);
  }
  return false;
}

interface BacktestParams {
  fast?: number; slow?: number;
  rsiPeriod?: number; rsiBuy?: number; rsiSell?: number;
  stopPct?: number; targetPct?: number;
}

function simulate(
  bars: { t: number; close: number }[],
  preset: Preset,
  params: BacktestParams,
  initial: number,
) {
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

export default defineTool({
  name: "run_backtest",
  title: "Run backtest",
  description:
    "Run a fast historical backtest on a Yahoo-style ticker with a preset strategy (buy_hold, sma_cross, rsi). Returns CAGR, total return, max drawdown, Sharpe, hit rate, and trade count. Requires authentication (rate-limited).",
  inputSchema: {
    symbol: z.string().min(1).describe("Yahoo ticker, e.g. AAPL, ENI.MI, BTC-USD"),
    preset: z.enum(["buy_hold", "sma_cross", "rsi"]).default("sma_cross").describe("Strategy preset"),
    range: z.enum(["6mo", "1y", "2y", "5y", "10y", "max"]).default("2y").describe("Historical window"),
    initial_capital: z.number().positive().max(10_000_000).default(10_000).describe("Starting cash for the sim"),
    fast: z.number().int().min(2).max(200).optional().describe("Fast SMA (sma_cross only)"),
    slow: z.number().int().min(3).max(400).optional().describe("Slow SMA (sma_cross only)"),
    rsi_period: z.number().int().min(2).max(50).optional().describe("RSI lookback (rsi only)"),
    rsi_buy: z.number().min(1).max(99).optional().describe("RSI oversold threshold"),
    rsi_sell: z.number().min(1).max(99).optional().describe("RSI overbought threshold"),
    stop_pct: z.number().min(0).max(100).optional().describe("Stop-loss %"),
    target_pct: z.number().min(0).max(500).optional().describe("Take-profit %"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async (args, ctx: ToolContext) => {
    return withInstrumentation("run_backtest", ctx, async () => {
      if (!ctx.isAuthenticated()) {
        return { content: [{ type: "text", text: "Not authenticated. Sign in via the OAuth flow to run backtests." }], isError: true };
      }
      const bars = await fetchHistory(args.symbol.toUpperCase(), args.range);
      if (bars.length < 30) {
        return {
          content: [{ type: "text", text: `Not enough historical data for "${args.symbol}" (${bars.length} bars).` }],
          isError: true,
        };
      }
      const params: BacktestParams = {
        fast: args.fast, slow: args.slow,
        rsiPeriod: args.rsi_period, rsiBuy: args.rsi_buy, rsiSell: args.rsi_sell,
        stopPct: args.stop_pct, targetPct: args.target_pct,
      };
      const metrics = simulate(bars, args.preset, params, args.initial_capital);
      const result = {
        symbol: args.symbol.toUpperCase(),
        preset: args.preset,
        range: args.range,
        initial_capital: args.initial_capital,
        params,
        metrics,
        start: new Date(bars[0].t).toISOString().slice(0, 10),
        end: new Date(bars[bars.length - 1].t).toISOString().slice(0, 10),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    }, { rateLimit: { max: 30, windowSec: 60 } });
  },
});