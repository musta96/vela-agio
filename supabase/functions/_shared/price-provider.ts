// =====================================================================
// price-provider — one adapter for long-horizon, corporate-action
// adjusted daily history.
//
// Provider chain (first available wins):
//   1. Financial Datasets  (env FINANCIAL_DATASETS_API_KEY, or the user's
//      BYO key stored in the vault as `financial_datasets`) — split &
//      dividend adjusted prices, 15y+.
//   2. Yahoo Finance chart with includeAdjustedClose (free fallback).
//   3. Stooq daily CSV (last-resort free fallback).
//
// Everything downstream (backtests, simulations) should call
// `getDailyHistory` instead of hitting Yahoo directly, so switching the
// paid provider on is a config change, not a code change.
// =====================================================================

import { getUserDataKey } from './data-provider.ts';

export interface DailyBar { t: number; close: number; adjClose: number; open?: number; high?: number; low?: number; volume?: number }
export interface HistoryResult {
  symbol: string;
  bars: DailyBar[];
  provider: 'financial_datasets' | 'yahoo' | 'stooq' | 'none';
  adjusted: boolean;
  years: number;
  attempts: Array<{ provider: string; ok: boolean; detail?: string }>;
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36';

function isoDaysAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export async function financialDatasetsKey(authHeader: string | null): Promise<string | null> {
  const env = Deno.env.get('FINANCIAL_DATASETS_API_KEY');
  if (env) return env;
  return await getUserDataKey(authHeader, 'financial_datasets');
}

async function fromFinancialDatasets(symbol: string, years: number, key: string): Promise<DailyBar[]> {
  const url = `https://api.financialdatasets.ai/prices/?ticker=${encodeURIComponent(symbol)}&interval=day&interval_multiplier=1&start_date=${isoDaysAgo(years)}&end_date=${new Date().toISOString().slice(0, 10)}&limit=5000`;
  const r = await fetch(url, { headers: { 'X-API-KEY': key } });
  if (!r.ok) throw new Error(`financial-datasets ${r.status}`);
  const j = await r.json();
  const rows: Array<Record<string, unknown>> = j?.prices ?? [];
  return rows.map((p) => {
    const close = Number(p.close);
    return {
      t: new Date(String(p.time)).getTime(),
      close,
      adjClose: Number(p.adjusted_close ?? close),
      open: Number(p.open), high: Number(p.high), low: Number(p.low), volume: Number(p.volume),
    };
  }).filter((b) => Number.isFinite(b.close) && Number.isFinite(b.t));
}

async function fromYahoo(symbol: string, years: number): Promise<DailyBar[]> {
  const range = years > 10 ? 'max' : years > 5 ? '10y' : years > 2 ? '5y' : '2y';
  const direct = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&events=div%2Csplit&includeAdjustedClose=true`;
  for (const u of [direct, `https://api.allorigins.win/raw?url=${encodeURIComponent(direct)}`]) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA } });
      if (!r.ok) continue;
      const j = await r.json();
      const res = j?.chart?.result?.[0];
      const ts: number[] = res?.timestamp ?? [];
      const q = res?.indicators?.quote?.[0] ?? {};
      const adj: (number | null)[] = res?.indicators?.adjclose?.[0]?.adjclose ?? [];
      const bars: DailyBar[] = [];
      const cutoff = Date.now() - years * 365.25 * 86400000;
      for (let i = 0; i < ts.length; i++) {
        const c = q.close?.[i];
        if (c == null || !Number.isFinite(c)) continue;
        const t = ts[i] * 1000;
        if (t < cutoff) continue;
        bars.push({ t, close: c, adjClose: Number(adj[i] ?? c), open: q.open?.[i], high: q.high?.[i], low: q.low?.[i], volume: q.volume?.[i] });
      }
      if (bars.length >= 60) return bars;
    } catch { /* next */ }
  }
  return [];
}

async function fromStooq(symbol: string): Promise<DailyBar[]> {
  const s = symbol.includes('.') ? symbol.toLowerCase() : `${symbol.toLowerCase()}.us`;
  const r = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(s)}&i=d`);
  if (!r.ok) return [];
  const text = await r.text();
  const bars: DailyBar[] = [];
  for (const line of text.trim().split('\n').slice(1)) {
    const [d, o, h, l, c, v] = line.split(',');
    const close = Number(c);
    if (!d || !Number.isFinite(close)) continue;
    bars.push({ t: new Date(d).getTime(), close, adjClose: close, open: +o, high: +h, low: +l, volume: +v });
  }
  return bars;
}

export async function getDailyHistory(
  symbol: string,
  years = 15,
  authHeader: string | null = null,
): Promise<HistoryResult> {
  const attempts: HistoryResult['attempts'] = [];
  const key = await financialDatasetsKey(authHeader);
  if (key) {
    try {
      const bars = await fromFinancialDatasets(symbol, years, key);
      attempts.push({ provider: 'financial_datasets', ok: bars.length > 0 });
      if (bars.length >= 60) return { symbol, bars, provider: 'financial_datasets', adjusted: true, years, attempts };
    } catch (e) {
      attempts.push({ provider: 'financial_datasets', ok: false, detail: e instanceof Error ? e.message : 'error' });
    }
  } else {
    attempts.push({ provider: 'financial_datasets', ok: false, detail: 'no API key configured' });
  }

  const y = await fromYahoo(symbol, years);
  attempts.push({ provider: 'yahoo', ok: y.length > 0 });
  if (y.length >= 60) return { symbol, bars: y, provider: 'yahoo', adjusted: true, years, attempts };

  const s = await fromStooq(symbol);
  attempts.push({ provider: 'stooq', ok: s.length > 0 });
  if (s.length >= 60) return { symbol, bars: s, provider: 'stooq', adjusted: false, years, attempts };

  return { symbol, bars: [], provider: 'none', adjusted: false, years, attempts };
}

/** Align several symbols on their common trading dates (adjusted closes). */
export async function getAlignedHistory(symbols: string[], years = 15, authHeader: string | null = null) {
  const series = await Promise.all(symbols.map((s) => getDailyHistory(s, years, authHeader)));
  const maps = series.map((s) => new Map(s.bars.map((b) => [new Date(b.t).toISOString().slice(0, 10), b.adjClose])));
  const common = [...(maps[0]?.keys() ?? [])].filter((d) => maps.every((m) => m.has(d))).sort();
  return {
    dates: common,
    prices: symbols.map((_, i) => common.map((d) => maps[i].get(d)!)),
    providers: series.map((s) => ({ symbol: s.symbol, provider: s.provider, adjusted: s.adjusted, bars: s.bars.length })),
  };
}
