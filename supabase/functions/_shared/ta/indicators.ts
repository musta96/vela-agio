import type { Bar } from "./types.ts";

export interface IndicatorPoint {
  t: number;
  close: number;
  sma20?: number;
  sma50?: number;
  rsi14?: number;
  upperBand?: number;
  lowerBand?: number;
}

function mean(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function stdev(values: number[]) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

export function computeIndicatorSeries(bars: Bar[], options?: { smaFast?: number; smaSlow?: number; rsiPeriod?: number; bollingerPeriod?: number; bollingerStd?: number }): IndicatorPoint[] {
  const smaFast = Math.max(2, options?.smaFast ?? 20);
  const smaSlow = Math.max(smaFast, options?.smaSlow ?? 50);
  const rsiPeriod = Math.max(2, options?.rsiPeriod ?? 14);
  const bollingerPeriod = Math.max(2, options?.bollingerPeriod ?? 20);
  const bollingerStd = Math.max(0.1, options?.bollingerStd ?? 2);
  return bars.map((bar, i) => {
    const closes = bars.slice(0, i + 1).map((b) => b.close);
    const fast = closes.slice(-smaFast);
    const slow = closes.slice(-smaSlow);
    const bb = closes.slice(-bollingerPeriod);
    const changes = closes.slice(Math.max(1, closes.length - rsiPeriod - 1)).map((c, j, arr) => j === 0 ? 0 : c - arr[j - 1]);
    const gains = changes.filter((v) => v > 0);
    const losses = changes.filter((v) => v < 0).map(Math.abs);
    const avgGain = mean(gains);
    const avgLoss = mean(losses);
    const rsi = avgLoss === 0 ? (avgGain > 0 ? 100 : 50) : 100 - 100 / (1 + avgGain / avgLoss);
    const center = mean(bb);
    const band = stdev(bb) * bollingerStd;
    return {
      t: bar.t, close: bar.close,
      sma20: fast.length >= smaFast ? mean(fast) : undefined,
      sma50: slow.length >= smaSlow ? mean(slow) : undefined,
      rsi14: closes.length > rsiPeriod ? rsi : undefined,
      upperBand: bb.length >= bollingerPeriod ? center + band : undefined,
      lowerBand: bb.length >= bollingerPeriod ? center - band : undefined,
    };
  });
}

export function latestIndicatorSummary(bars: Bar[]) {
  const latest = computeIndicatorSeries(bars).at(-1);
  if (!latest) return null;
  return {
    sma20: latest.sma20 ?? null,
    sma50: latest.sma50 ?? null,
    rsi14: latest.rsi14 ?? null,
    bollingerPosition: latest.upperBand && latest.lowerBand
      ? (latest.close - latest.lowerBand) / Math.max(1e-9, latest.upperBand - latest.lowerBand)
      : null,
  };
}
