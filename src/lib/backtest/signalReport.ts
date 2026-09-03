import { detectCandlestickPatterns } from "@/lib/ta/candlesticks";
import { computeAVWAP } from "@/lib/ta/avwap";
import { computeFibonacci } from "@/lib/ta/fib";
import { supportResistance, findTrendlines } from "@/lib/ta/structure";
import { detectOrderBlocks } from "@/lib/ta/smc";
import { detectSweeps } from "@/lib/ta/sweeps";
import { computeVolumeProfile } from "@/lib/ta/volumeProfile";
import type { Bar } from "@/lib/ta/types";
import type { DetectorSettings } from "@/lib/ta/detectorSettings";

export type SignalKind = "Candlestick" | "Support / resistance" | "Order block" | "Liquidity sweep" | "Trendline" | "Fibonacci" | "Anchored VWAP" | "Volume profile";
export interface SignalStat { kind: SignalKind; signals: number; winRate: number; averageReturn: number; bestReturn: number; worstReturn: number; }
interface Event { kind: SignalKind; index: number; direction: 1 | -1; }

const clampIndex = (i: number, length: number) => Math.max(0, Math.min(length - 1, i));

export function signalReport(input: Bar[], settings: DetectorSettings, horizon = 10): SignalStat[] {
  if (input.length < 20) return [];
  const bars = input;
  const events: Event[] = [];
  const start = Math.max(0, bars.length - settings.patternLookback);
  for (const p of detectCandlestickPatterns(bars.slice(start))) {
    const index = p.index + start;
    if (index < bars.length - horizon) events.push({ kind: "Candlestick", index, direction: p.bias === "bearish" ? -1 : 1 });
  }
  const zones = supportResistance(bars, settings.supportResistanceTolerance);
  for (const z of zones) {
    const index = bars.reduce((best, b, i) => Math.abs(b.close - z.price) < Math.abs(bars[best].close - z.price) ? i : best, 0);
    if (index < bars.length - horizon) events.push({ kind: "Support / resistance", index, direction: z.type === "support" ? 1 : -1 });
  }
  for (const o of detectOrderBlocks(bars)) if (o.index < bars.length - horizon) events.push({ kind: "Order block", index: o.index, direction: o.bias === "bearish" ? -1 : 1 });
  for (const s of detectSweeps(bars).filter((x) => x.reclaimed)) if (s.index < bars.length - horizon) events.push({ kind: "Liquidity sweep", index: s.index, direction: s.bias === "bearish" ? -1 : 1 });
  for (const t of findTrendlines(bars.slice(Math.max(0, bars.length - settings.trendlineLookback)))) {
    if (t.broken) {
      const index = clampIndex(t.broken.index + Math.max(0, bars.length - settings.trendlineLookback), bars.length);
      if (index < bars.length - horizon) events.push({ kind: "Trendline", index, direction: t.kind === "down" ? 1 : -1 });
    }
  }
  const fibBars = bars.slice(Math.max(0, bars.length - settings.fibonacciLookback));
  const fib = computeFibonacci(fibBars);
  if (fib) for (let i = Math.max(0, bars.length - fibBars.length); i < bars.length - horizon; i++) {
    if (bars[i].close >= fib.goldenZone.bottom && bars[i].close <= fib.goldenZone.top) events.push({ kind: "Fibonacci", index: i, direction: 1 });
  }
  const avwapAnchor = Math.max(0, bars.length - settings.avwapAnchorLookback);
  const avwap = computeAVWAP(bars, avwapAnchor);
  for (let i = avwapAnchor + 1; i < bars.length - horizon; i++) {
    const previous = avwap[i - 1].avwap, current = avwap[i].avwap;
    if (previous == null || current == null) continue;
    if (bars[i - 1].close <= previous && bars[i].close > current) events.push({ kind: "Anchored VWAP", index: i, direction: 1 });
    if (bars[i - 1].close >= previous && bars[i].close < current) events.push({ kind: "Anchored VWAP", index: i, direction: -1 });
  }
  const vpStart = Math.max(0, bars.length - settings.volumeProfileLookback);
  const profile = computeVolumeProfile(bars.slice(vpStart), settings.volumeProfileBins);
  if (profile) for (let i = vpStart; i < bars.length - horizon; i++) {
    if (bars[i].close > profile.poc && (i === vpStart || bars[i - 1].close <= profile.poc)) events.push({ kind: "Volume profile", index: i, direction: 1 });
    if (bars[i].close < profile.poc && (i === vpStart || bars[i - 1].close >= profile.poc)) events.push({ kind: "Volume profile", index: i, direction: -1 });
  }

  const grouped = new Map<SignalKind, number[]>();
  for (const event of events) {
    const future = bars[event.index + horizon]?.close;
    const current = bars[event.index]?.close;
    if (!future || !current) continue;
    const returnPct = ((future / current - 1) * 100) * event.direction;
    const values = grouped.get(event.kind) ?? [];
    values.push(returnPct);
    grouped.set(event.kind, values);
  }
  return Array.from(grouped.entries()).map(([kind, values]) => ({
    kind, signals: values.length,
    winRate: values.filter((v) => v > 0).length / values.length * 100,
    averageReturn: values.reduce((a, b) => a + b, 0) / values.length,
    bestReturn: Math.max(...values), worstReturn: Math.min(...values),
  })).sort((a, b) => b.averageReturn - a.averageReturn);
}
