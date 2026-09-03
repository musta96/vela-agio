import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';
import { detectCandlestickPatterns } from '../_shared/ta/candlesticks.ts';
import { supportResistance, findTrendlines, detectStructure } from '../_shared/ta/structure.ts';
import { detectFVGs, detectOrderBlocks, detectLiquidityGrabs, detectSupplyDemand } from '../_shared/ta/smc.ts';
import { computeFibonacci } from '../_shared/ta/fib.ts';
import { computeAVWAP, suggestAnchors, detectAVWAPReclaim } from '../_shared/ta/avwap.ts';
import { computeVolumeProfile } from '../_shared/ta/volumeProfile.ts';
import { detectSweeps, DEFAULT_SWEEP_CONFIG } from '../_shared/ta/sweeps.ts';
import type { Bar } from '../_shared/ta/types.ts';

const BodySchema = z.object({
  symbol: z.string().trim().min(1).max(20),
  range: z.enum(['3M', '6M', '1Y', '2Y', '5Y']).optional(),
});

const RANGE_MAP: Record<string, { range: string; interval: string }> = {
  '3M': { range: '3mo', interval: '1d' },
  '6M': { range: '6mo', interval: '1d' },
  '1Y': { range: '1y', interval: '1d' },
  '2Y': { range: '2y', interval: '1d' },
  '5Y': { range: '5y', interval: '1wk' },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function fetchBars(symbol: string, key: string): Promise<Bar[]> {
  const { range, interval } = RANGE_MAP[key] ?? RANGE_MAP['1Y'];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return [];
  const j = await res.json();
  const r = j?.chart?.result?.[0];
  if (!r) return [];
  const ts: number[] = r.timestamp ?? [];
  const q = r.indicators?.quote?.[0] ?? {};
  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i];
    if (typeof c !== 'number' || Number.isNaN(c)) continue;
    bars.push({
      t: ts[i] * 1000,
      open: q.open?.[i] ?? c,
      high: q.high?.[i] ?? c,
      low: q.low?.[i] ?? c,
      close: c,
      volume: q.volume?.[i] ?? 0,
    });
  }
  return bars;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { symbol, range = '1Y' } = parsed.data;

    const bars = await fetchBars(symbol.toUpperCase(), range);
    if (bars.length < 40) return json({ error: 'not_enough_data', symbol }, 422);

    const last = bars[bars.length - 1];
    const anchors = suggestAnchors(bars);
    const anchorIndex = anchors[0]?.index ?? Math.max(0, bars.length - 60);
    const avwap = computeAVWAP(bars, anchorIndex);
    const avwapLast = avwap[avwap.length - 1]?.avwap ?? null;
    const vp = computeVolumeProfile(bars.slice(-120), 24);
    const fib = computeFibonacci(bars.slice(-120));
    const sweeps = detectSweeps(bars, DEFAULT_SWEEP_CONFIG);
    const patterns = detectCandlestickPatterns(bars).slice(-12);
    const levels = supportResistance(bars);
    const obs = detectOrderBlocks(bars).slice(-6);

    return json({
      symbol: symbol.toUpperCase(),
      range,
      bars: bars.length,
      lastPrice: last.close,
      lastBarTs: last.t,
      candlestickPatterns: patterns.map((p) => ({ name: p.name, bias: p.bias, date: new Date(p.t).toISOString().slice(0, 10) })),
      supportResistance: levels.map((z) => ({ type: z.type, price: z.price, strength: z.strength })),
      trendlines: findTrendlines(bars.slice(-120)).map((t) => ({ kind: t.kind, from: t.from.price, to: t.to.price, broken: !!t.broken })),
      structure: detectStructure(bars).slice(-5),
      orderBlocks: obs.map((o) => ({ bias: o.bias, top: o.top, bottom: o.bottom })),
      fairValueGaps: detectFVGs(bars).slice(-6),
      liquidityGrabs: detectLiquidityGrabs(bars).slice(-6),
      supplyDemand: detectSupplyDemand(bars).slice(-6),
      liquiditySweeps: sweeps.slice(-6).map((s) => ({ bias: s.bias, level: s.sweptLevel, reclaimed: s.reclaimed, date: new Date(s.t).toISOString().slice(0, 10) })),
      anchoredVwap: { anchorDate: new Date(bars[anchorIndex].t).toISOString().slice(0, 10), value: avwapLast, priceVsAvwap: avwapLast ? (last.close / avwapLast - 1) * 100 : null, reclaim: detectAVWAPReclaim(avwap) },
      volumeProfile: vp ? { poc: vp.poc, vah: vp.vah, val: vp.val } : null,
      fibonacci: fib ? { bias: fib.bias, direction: fib.direction, levels: fib.levels.map((l) => ({ label: l.label, kind: l.kind, price: l.price, golden: l.inGoldenZone })), atLevel: fib.atLevel?.label ?? null } : null,
    });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
