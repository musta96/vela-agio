// Volume Profile with POC (Point Of Control) and 70% Value Area.
// Fixed number of price bins across the visible range; volume is spread across
// the bins that fall within each bar's high/low range.

import type { Bar } from "./types";

export interface VolumeBin {
  price: number;
  bottom: number;
  top: number;
  volume: number;
}

export interface VolumeProfileResult {
  bins: VolumeBin[];
  poc: number;
  vah: number;   // Value Area High (top of 70% volume band)
  val: number;   // Value Area Low
  totalVolume: number;
}

export function computeVolumeProfile(bars: Bar[], numBins = 24): VolumeProfileResult | null {
  if (bars.length < 2) return null;
  let min = Infinity, max = -Infinity;
  for (const b of bars) { if (b.low < min) min = b.low; if (b.high > max) max = b.high; }
  if (!isFinite(min) || !isFinite(max) || max <= min) return null;

  const step = (max - min) / numBins;
  const bins: VolumeBin[] = Array.from({ length: numBins }, (_, i) => ({
    price: min + step * (i + 0.5),
    bottom: min + step * i,
    top: min + step * (i + 1),
    volume: 0,
  }));

  for (const b of bars) {
    const vol = b.volume && b.volume > 0 ? b.volume : 1;
    // Fraction of bar range that overlaps each bin.
    const barRange = Math.max(1e-9, b.high - b.low);
    const startBin = Math.max(0, Math.floor((b.low - min) / step));
    const endBin = Math.min(numBins - 1, Math.floor((b.high - min) / step));
    if (startBin === endBin) {
      bins[startBin].volume += vol;
    } else {
      for (let k = startBin; k <= endBin; k++) {
        const overlap = Math.min(bins[k].top, b.high) - Math.max(bins[k].bottom, b.low);
        if (overlap > 0) bins[k].volume += vol * (overlap / barRange);
      }
    }
  }

  const totalVolume = bins.reduce((s, b) => s + b.volume, 0);
  let pocIdx = 0;
  for (let i = 1; i < bins.length; i++) if (bins[i].volume > bins[pocIdx].volume) pocIdx = i;
  const target = totalVolume * 0.7;
  let accum = bins[pocIdx].volume;
  let lo = pocIdx, hi = pocIdx;
  while (accum < target && (lo > 0 || hi < bins.length - 1)) {
    const nextDown = lo > 0 ? bins[lo - 1].volume : -1;
    const nextUp = hi < bins.length - 1 ? bins[hi + 1].volume : -1;
    if (nextUp >= nextDown) { hi++; accum += Math.max(0, nextUp); }
    else { lo--; accum += Math.max(0, nextDown); }
  }
  return {
    bins,
    poc: bins[pocIdx].price,
    val: bins[lo].bottom,
    vah: bins[hi].top,
    totalVolume,
  };
}