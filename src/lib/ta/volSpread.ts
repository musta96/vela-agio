// Volatility spread module: compute z-score of a "vol proxy vs realized vol" ratio
// (e.g., ^VIX / realizedVol(SPY)) and generate long/short spread signals.

export interface Bar { t: number; close: number; }

export interface VolSpreadConfig {
  window: number;      // realized vol lookback (bars)
  zWindow: number;     // z-score lookback
  entryZ: number;      // enter long spread when z <= -entryZ; short when z >= +entryZ
  exitZ: number;       // exit when |z| <= exitZ
  trendEmaPeriod?: number; // optional trend filter on the ratio itself
}

export const DEFAULT_VOL_SPREAD: VolSpreadConfig = {
  window: 20, zWindow: 60, entryZ: 1.5, exitZ: 0.25, trendEmaPeriod: 20,
};

export interface VolSpreadPoint {
  t: number;
  ratio: number;
  z: number | null;
  trendUp: boolean | null;
  signal: "long" | "short" | "flat";
}

function realizedVol(closes: number[], i: number, window: number): number | null {
  if (i < window) return null;
  const rets: number[] = [];
  for (let k = i - window + 1; k <= i; k++) {
    const prev = closes[k - 1]; if (!prev) return null;
    rets.push(Math.log(closes[k] / prev));
  }
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((a, b) => a + (b - m) ** 2, 0) / rets.length;
  return Math.sqrt(v) * Math.sqrt(252) * 100;
}

function ema(vals: (number | null)[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(vals.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (v == null) continue;
    prev = prev == null ? v : v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * `volSeries` is typically a vol index (VIX, GVZ, VXN); `underlying` is the
 * matching asset (SPY, GLD, QQQ). Series must be aligned by index.
 */
export function computeVolSpread(volSeries: Bar[], underlying: Bar[], cfg: Partial<VolSpreadConfig> = {}): VolSpreadPoint[] {
  const c = { ...DEFAULT_VOL_SPREAD, ...cfg };
  const n = Math.min(volSeries.length, underlying.length);
  const uc = underlying.slice(0, n).map((b) => b.close);
  const ratios: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const rv = realizedVol(uc, i, c.window);
    const v = volSeries[i].close;
    if (rv && rv > 0 && v > 0) ratios[i] = v / rv;
  }
  const emaSeries = c.trendEmaPeriod ? ema(ratios, c.trendEmaPeriod) : ratios.map(() => null);

  const out: VolSpreadPoint[] = [];
  for (let i = 0; i < n; i++) {
    const r = ratios[i];
    if (r == null || i < c.zWindow) { out.push({ t: volSeries[i].t, ratio: r ?? 0, z: null, trendUp: null, signal: "flat" }); continue; }
    const win = ratios.slice(i - c.zWindow + 1, i + 1).filter((x): x is number => x != null);
    const m = win.reduce((a, b) => a + b, 0) / win.length;
    const sd = Math.sqrt(win.reduce((a, b) => a + (b - m) ** 2, 0) / win.length);
    const z = sd > 0 ? (r - m) / sd : 0;
    const trendUp = emaSeries[i] != null && emaSeries[i - 1] != null ? (emaSeries[i]! > emaSeries[i - 1]!) : null;

    // Long spread = long vol / short underlying (implied cheap vs realized).
    // Short spread = short vol / long underlying (implied rich).
    let signal: VolSpreadPoint["signal"] = "flat";
    if (Math.abs(z) <= c.exitZ) signal = "flat";
    else if (z <= -c.entryZ && (trendUp === null || !trendUp)) signal = "long";
    else if (z >= c.entryZ && (trendUp === null || trendUp)) signal = "short";
    out.push({ t: volSeries[i].t, ratio: r, z, trendUp, signal });
  }
  return out;
}

/** Simple PnL of long/short spread signals held bar-to-bar. */
export function backtestVolSpread(points: VolSpreadPoint[], underlying: Bar[]): { pnlPct: number[]; total: number; wins: number; trades: number } {
  const pnlPct: number[] = [];
  let total = 0, wins = 0, trades = 0;
  let pos: "long" | "short" | "flat" = "flat";
  let entry = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (pos === "flat" && (p.signal === "long" || p.signal === "short")) {
      pos = p.signal; entry = underlying[i].close;
    } else if (pos !== "flat" && p.signal === "flat") {
      const move = (underlying[i].close - entry) / entry * 100;
      const pnl = pos === "long" ? -move : move; // long "spread" = short underlying
      total += pnl; trades++; if (pnl > 0) wins++;
      pos = "flat";
    }
    pnlPct.push(total);
  }
  return { pnlPct, total, wins, trades };
}

export const VOL_SPREAD_PRESETS: { label: string; volSymbol: string; underlyingSymbol: string }[] = [
  { label: "VIX / SPY",  volSymbol: "^VIX", underlyingSymbol: "SPY" },
  { label: "GVZ / GLD",  volSymbol: "^GVZ", underlyingSymbol: "GLD" },
  { label: "VXN / QQQ",  volSymbol: "^VXN", underlyingSymbol: "QQQ" },
  { label: "OVX / USO",  volSymbol: "^OVX", underlyingSymbol: "USO" },
];