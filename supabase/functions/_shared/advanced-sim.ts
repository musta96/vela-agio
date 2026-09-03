// =====================================================================
// Advanced portfolio simulation engine (Deno / edge)
//
// Upgrades over the legacy lognormal GBM engine:
//  - historical bootstrap (iid + stationary block) and Student-t fat tails
//  - two-state regime switching (calm / stress) with estimated transitions
//  - explicit FX paths for non-base-currency assets
//  - frictions: TER, bid-ask spread, transaction costs, capital-gains tax
//  - futures roll drag and dynamic short-borrow costs
//  - broker maintenance margin with forced deleveraging / liquidation
//  - blended-portfolio search under CVaR and max-drawdown constraints
// =====================================================================

export interface AssetSpec {
  symbol: string;
  weight: number;          // may be negative (short)
  ter?: number;            // annual fund fee, e.g. 0.0022
  spreadBps?: number;      // half-spread paid on entry and exit
  borrowRate?: number;     // annual borrow cost applied to short exposure
  rollDragPct?: number;    // annual futures roll yield (negative = drag)
  fx?: string;             // Yahoo FX pair converting asset ccy -> base, e.g. "EURUSD=X"
}

export interface SimConfig {
  paths?: number;
  years?: number;
  initial?: number;
  method?: "bootstrap" | "block" | "student_t" | "gbm";
  blockSize?: number;
  regimeSwitching?: boolean;
  dfTail?: number;            // Student-t degrees of freedom
  taxRate?: number;           // capital-gains tax applied to terminal gain
  transactionCostBps?: number;
  maintenanceMargin?: number; // e.g. 0.25 -> liquidate below 25% equity/gross
  history?: string;           // Yahoo range, default "10y"
  seed?: number;
}

export interface Bar { t: number; close: number }

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36";
const TRADING_DAYS = 252;

// ---------------------------------------------------------------- data
export async function fetchDaily(symbol: string, range = "10y"): Promise<Bar[]> {
  const direct = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&events=div%2Csplit`;
  const urls = [direct, `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(direct)}`];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (!r.ok) continue;
      const j = await r.json();
      const res = j?.chart?.result?.[0];
      const ts: number[] = res?.timestamp ?? [];
      // adjclose is corporate-action adjusted (splits + dividends) => total return
      const adj: (number | null)[] = res?.indicators?.adjclose?.[0]?.adjclose
        ?? res?.indicators?.quote?.[0]?.close ?? [];
      const bars: Bar[] = [];
      for (let i = 0; i < ts.length; i++) {
        const c = adj[i];
        if (c != null && Number.isFinite(c) && c > 0) bars.push({ t: ts[i] * 1000, close: c });
      }
      if (bars.length >= 120) return bars;
    } catch { /* next */ }
  }
  return [];
}

/** Align several symbols on their common calendar days and return log-returns. */
export function alignReturns(series: Record<string, Bar[]>): { dates: number[]; returns: Record<string, number[]> } {
  const symbols = Object.keys(series).filter((s) => series[s].length > 1);
  if (!symbols.length) return { dates: [], returns: {} };
  const maps = symbols.map((s) => {
    const m = new Map<string, number>();
    for (const b of series[s]) m.set(new Date(b.t).toISOString().slice(0, 10), b.close);
    return m;
  });
  let common = [...maps[0].keys()];
  for (let i = 1; i < maps.length; i++) common = common.filter((d) => maps[i].has(d));
  common.sort();
  const returns: Record<string, number[]> = {};
  symbols.forEach((s, si) => {
    const arr: number[] = [];
    for (let i = 1; i < common.length; i++) {
      const p0 = maps[si].get(common[i - 1])!, p1 = maps[si].get(common[i])!;
      arr.push(Math.log(p1 / p0));
    }
    returns[s] = arr;
  });
  return { dates: common.slice(1).map((d) => Date.parse(d)), returns };
}

// ------------------------------------------------------------- helpers
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normal(rnd: () => number) {
  const u = Math.max(rnd(), 1e-12), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function studentT(rnd: () => number, df: number) {
  // normal / sqrt(chi2/df) with chi2 approximated by sum of squared normals
  let chi = 0;
  const k = Math.max(3, Math.round(df));
  for (let i = 0; i < k; i++) { const n = normal(rnd); chi += n * n; }
  return normal(rnd) / Math.sqrt(chi / k) * Math.sqrt((k - 2) / k);
}
function mean(a: number[]) { return a.reduce((x, y) => x + y, 0) / (a.length || 1); }
function std(a: number[]) { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length || 1)); }
function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[i];
}

/** Split day indices into calm/stress regimes by rolling realised vol. */
function regimeSplit(port: number[], window = 21) {
  const vol: number[] = [];
  for (let i = 0; i < port.length; i++) {
    const s = Math.max(0, i - window + 1);
    vol.push(std(port.slice(s, i + 1)));
  }
  const cut = quantile([...vol].sort((a, b) => a - b), 0.75);
  const state = vol.map((v) => (v > cut ? 1 : 0));
  // transition matrix
  const counts = [[0, 0], [0, 0]];
  for (let i = 1; i < state.length; i++) counts[state[i - 1]][state[i]]++;
  const p = counts.map((row) => {
    const tot = row[0] + row[1] || 1;
    return [row[0] / tot, row[1] / tot];
  });
  const calm: number[] = [], stress: number[] = [];
  state.forEach((s, i) => (s === 1 ? stress : calm).push(i));
  return { state, trans: p, calm, stress };
}

// ------------------------------------------------------------- results
export interface SimResult {
  paths: number;
  years: number;
  method: string;
  regimeSwitching: boolean;
  initial: number;
  expectedValue: number;
  medianValue: number;
  percentiles: Record<string, number>;
  cagrMedian: number;
  probLoss: number;
  probLiquidation: number;
  var95: number; cvar95: number; var99: number; cvar99: number;
  maxDrawdownMedian: number; maxDrawdownP95: number;
  totalCostsPct: number;
  fanChart: { step: number; p5: number; p25: number; p50: number; p75: number; p95: number }[];
  usedSymbols: string[];
  historyDays: number;
  warnings: string[];
}

export interface SimInputs { assets: AssetSpec[]; config: SimConfig }

export async function loadHistory(assets: AssetSpec[], range: string) {
  const syms = [...new Set(assets.map((a) => a.symbol.toUpperCase()))];
  const fxSyms = [...new Set(assets.map((a) => a.fx).filter(Boolean) as string[])].map((s) => s.toUpperCase());
  const all = [...syms, ...fxSyms];
  const fetched = await Promise.all(all.map(async (s) => [s, await fetchDaily(s, range)] as const));
  const series: Record<string, Bar[]> = {};
  const missing: string[] = [];
  for (const [s, bars] of fetched) { if (bars.length >= 120) series[s] = bars; else missing.push(s); }
  return { series, missing };
}

export function simulate(assets: AssetSpec[], returns: Record<string, number[]>, cfg: SimConfig): SimResult {
  const warnings: string[] = [];
  const paths = Math.min(Math.max(cfg.paths ?? 20_000, 500), 100_000);
  const years = Math.min(Math.max(cfg.years ?? 10, 0.25), 40);
  const initial = cfg.initial ?? 100_000;
  const method = cfg.method ?? "block";
  const blockSize = Math.max(2, cfg.blockSize ?? 10);
  const steps = Math.round(years * TRADING_DAYS);
  const rnd = mulberry32(cfg.seed ?? 20260903);

  const usable = assets.filter((a) => returns[a.symbol.toUpperCase()]?.length);
  if (!usable.length) throw new Error("No usable price history for the requested assets.");
  const n = Math.min(...usable.map((a) => returns[a.symbol.toUpperCase()].length));
  const grossW = usable.reduce((s, a) => s + Math.abs(a.weight), 0) || 1;

  // Historical portfolio return series (weights fixed), FX-converted.
  const hist: number[] = [];
  for (let i = n - 1; i >= 0; i--) {
    let r = 0;
    for (const a of usable) {
      const s = returns[a.symbol.toUpperCase()];
      let ri = s[s.length - 1 - i];
      if (a.fx) {
        const f = returns[a.fx.toUpperCase()];
        if (f?.length) ri += f[f.length - 1 - i] ?? 0;
      }
      r += a.weight * ri;
    }
    hist.push(r);
  }
  const muD = mean(hist), sdD = std(hist);
  const reg = cfg.regimeSwitching !== false ? regimeSplit(hist) : null;
  if (reg && reg.stress.length < 20) warnings.push("Stress regime has few observations; regime results are indicative.");

  // Annual frictions expressed per trading day.
  let annualDrag = 0;
  for (const a of usable) {
    annualDrag += Math.abs(a.weight) * (a.ter ?? 0);
    if (a.weight < 0) annualDrag += Math.abs(a.weight) * (a.borrowRate ?? 0.03);
    if (a.rollDragPct) annualDrag -= a.weight * (a.rollDragPct);
  }
  const dailyDrag = annualDrag / TRADING_DAYS;
  const entryCost = usable.reduce((s, a) => s + Math.abs(a.weight) * ((a.spreadBps ?? 5) / 10_000), 0)
    + grossW * ((cfg.transactionCostBps ?? 5) / 10_000);
  const exitCost = entryCost;

  const maint = cfg.maintenanceMargin ?? 0.25;
  const levered = grossW > 1.001;

  const finals: number[] = [];
  const maxDDs: number[] = [];
  let liquidations = 0;
  const fanSteps = 40;
  const fanIdx = Array.from({ length: fanSteps }, (_, i) => Math.max(1, Math.round(((i + 1) / fanSteps) * steps)));
  const fanSamples: number[][] = fanIdx.map(() => []);

  for (let p = 0; p < paths; p++) {
    let equity = initial * (1 - entryCost);
    let peak = equity, maxDD = 0, liquidated = false;
    let regState = reg ? (rnd() < 0.75 ? 0 : 1) : 0;
    let bi = Math.floor(rnd() * n), bleft = 0;
    let fi = 0;

    for (let s = 0; s < steps; s++) {
      let r: number;
      if (method === "gbm") {
        r = muD - 0.5 * sdD * sdD / 1 + sdD * normal(rnd);
      } else if (method === "student_t") {
        r = muD + sdD * studentT(rnd, cfg.dfTail ?? 5);
      } else if (reg) {
        regState = rnd() < reg.trans[regState][1] ? 1 : 0;
        const pool = regState === 1 ? reg.stress : reg.calm;
        const src = pool.length ? pool : reg.calm;
        r = hist[src[Math.floor(rnd() * src.length)]] ?? 0;
      } else if (method === "block") {
        if (bleft <= 0) { bi = Math.floor(rnd() * n); bleft = blockSize; }
        r = hist[bi % n]; bi++; bleft--;
      } else {
        r = hist[Math.floor(rnd() * n)];
      }
      r -= dailyDrag;
      equity *= Math.exp(r);

      if (equity > peak) peak = equity;
      const dd = (equity - peak) / peak;
      if (dd < maxDD) maxDD = dd;

      // Forced deleveraging: leveraged book whose equity ratio breaks maintenance.
      if (levered && !liquidated) {
        const equityRatio = equity / (initial * grossW) * 1;
        if (equityRatio < maint) {
          liquidated = true; liquidations++;
          equity *= (1 - exitCost);            // liquidation slippage
          // book flattened -> no further market exposure
          for (let k = s; k < steps; k++) { /* flat */ }
          while (fi < fanIdx.length && fanIdx[fi] <= steps) { fanSamples[fi].push(equity); fi++; }
          break;
        }
      }
      if (fi < fanIdx.length && s + 1 === fanIdx[fi]) { fanSamples[fi].push(equity); fi++; }
    }
    while (fi < fanIdx.length) { fanSamples[fi].push(equity); fi++; }

    equity *= (1 - exitCost);
    const gain = equity - initial;
    if (gain > 0 && cfg.taxRate) equity -= gain * cfg.taxRate;
    finals.push(equity);
    maxDDs.push(maxDD);
  }

  const sorted = [...finals].sort((a, b) => a - b);
  const ddSorted = [...maxDDs].sort((a, b) => a - b);
  const pct = (q: number) => quantile(sorted, q);
  const tail = (q: number) => {
    const cut = Math.max(1, Math.floor(q * sorted.length));
    return mean(sorted.slice(0, cut));
  };
  const median = pct(0.5);

  return {
    paths, years, method: reg ? `${method}+regime` : method,
    regimeSwitching: !!reg,
    initial,
    expectedValue: +mean(finals).toFixed(2),
    medianValue: +median.toFixed(2),
    percentiles: {
      p1: +pct(0.01).toFixed(2), p5: +pct(0.05).toFixed(2), p10: +pct(0.1).toFixed(2),
      p25: +pct(0.25).toFixed(2), p50: +median.toFixed(2), p75: +pct(0.75).toFixed(2),
      p90: +pct(0.9).toFixed(2), p95: +pct(0.95).toFixed(2), p99: +pct(0.99).toFixed(2),
    },
    cagrMedian: +(((median / initial) ** (1 / years) - 1) * 100).toFixed(2),
    probLoss: +((finals.filter((v) => v < initial).length / paths) * 100).toFixed(2),
    probLiquidation: +((liquidations / paths) * 100).toFixed(2),
    var95: +((1 - pct(0.05) / initial) * 100).toFixed(2),
    cvar95: +((1 - tail(0.05) / initial) * 100).toFixed(2),
    var99: +((1 - pct(0.01) / initial) * 100).toFixed(2),
    cvar99: +((1 - tail(0.01) / initial) * 100).toFixed(2),
    maxDrawdownMedian: +(quantile(ddSorted, 0.5) * 100).toFixed(2),
    maxDrawdownP95: +(quantile(ddSorted, 0.05) * 100).toFixed(2),
    totalCostsPct: +(((entryCost + exitCost) + annualDrag * years) * 100).toFixed(2),
    fanChart: fanIdx.map((step, i) => {
      const s = [...fanSamples[i]].sort((a, b) => a - b);
      return {
        step, p5: +quantile(s, 0.05).toFixed(0), p25: +quantile(s, 0.25).toFixed(0),
        p50: +quantile(s, 0.5).toFixed(0), p75: +quantile(s, 0.75).toFixed(0), p95: +quantile(s, 0.95).toFixed(0),
      };
    }),
    usedSymbols: usable.map((a) => a.symbol.toUpperCase()),
    historyDays: n,
    warnings,
  };
}

// --------------------------------------------------------------- blend
export interface BlendCandidate { name: string; assets: AssetSpec[] }
export interface BlendConstraints { maxCvar95?: number; maxDrawdown?: number; maxWeightPerSled?: number; step?: number }

export interface BlendRow {
  mix: Record<string, number>;
  expectedValue: number; medianValue: number; cagrMedian: number;
  cvar95: number; maxDrawdownP95: number; probLoss: number; probLiquidation: number;
  feasible: boolean; violations: string[];
}

/** Merge sleeve weights into a single asset list scaled by mix. */
export function mergeSleeves(candidates: BlendCandidate[], mix: Record<string, number>): AssetSpec[] {
  const out = new Map<string, AssetSpec>();
  for (const c of candidates) {
    const m = mix[c.name] ?? 0;
    if (!m) continue;
    for (const a of c.assets) {
      const key = a.symbol.toUpperCase();
      const prev = out.get(key);
      const w = a.weight * m;
      if (prev) prev.weight += w;
      else out.set(key, { ...a, symbol: key, weight: w });
    }
  }
  return [...out.values()].filter((a) => Math.abs(a.weight) > 1e-6);
}

/** Grid search over sleeve mixes under CVaR / drawdown constraints. */
export function searchBlends(
  candidates: BlendCandidate[],
  returns: Record<string, number[]>,
  cfg: SimConfig,
  cons: BlendConstraints,
): BlendRow[] {
  const step = cons.step ?? 0.1;
  const names = candidates.map((c) => c.name);
  const grids: Record<string, number>[] = [];
  const build = (i: number, left: number, acc: Record<string, number>) => {
    if (i === names.length - 1) { grids.push({ ...acc, [names[i]]: +left.toFixed(4) }); return; }
    for (let w = 0; w <= left + 1e-9; w += step) build(i + 1, +(left - w).toFixed(4), { ...acc, [names[i]]: +w.toFixed(4) });
  };
  build(0, 1, {});

  const capped = cons.maxWeightPerSled
    ? grids.filter((g) => names.every((nm) => g[nm] <= cons.maxWeightPerSled! + 1e-9))
    : grids;

  const rows: BlendRow[] = [];
  for (const mix of capped.slice(0, 80)) {
    const merged = mergeSleeves(candidates, mix);
    if (!merged.length) continue;
    let res: SimResult;
    try { res = simulate(merged, returns, { ...cfg, paths: Math.min(cfg.paths ?? 8000, 12_000) }); }
    catch { continue; }
    const violations: string[] = [];
    if (cons.maxCvar95 != null && res.cvar95 > cons.maxCvar95) violations.push(`CVaR95 ${res.cvar95}% > ${cons.maxCvar95}%`);
    if (cons.maxDrawdown != null && Math.abs(res.maxDrawdownP95) > cons.maxDrawdown) violations.push(`MaxDD(p95) ${res.maxDrawdownP95}% breaches ${cons.maxDrawdown}%`);
    rows.push({
      mix, expectedValue: res.expectedValue, medianValue: res.medianValue, cagrMedian: res.cagrMedian,
      cvar95: res.cvar95, maxDrawdownP95: res.maxDrawdownP95, probLoss: res.probLoss,
      probLiquidation: res.probLiquidation, feasible: violations.length === 0, violations,
    });
  }
  rows.sort((a, b) => (Number(b.feasible) - Number(a.feasible)) || (b.medianValue - a.medianValue));
  return rows;
}
