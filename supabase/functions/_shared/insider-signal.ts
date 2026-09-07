// =====================================================================
// insider-signal — shared scoring of insider / PDMR transaction sets.
// Used by the insider screener, the insider dashboard payloads and the
// full-analysis orchestrator so every surface reads the same number.
// =====================================================================

export interface InsiderTx {
  date: string;
  code: string;
  shares: number;
  price: number;
  value: number;
  acquired: boolean;
  insider: string;
  role?: string;
}

export interface InsiderSignal {
  score: number;               // -100 (heavy selling) .. +100 (heavy buying)
  label: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  buys: number;
  sells: number;
  buyValue: number;
  sellValue: number;
  netValue: number;
  uniqueBuyers: number;
  uniqueSellers: number;
  cluster: boolean;            // 3+ distinct insiders buying
  lastDate: string | null;
  lookbackDays: number;
  transactions: number;
}

/**
 * Dollar-weighted buy/sell bias over the lookback window, boosted when
 * several distinct insiders act in the same direction (cluster buying is the
 * historically informative pattern) and damped when the sample is tiny.
 */
export function scoreInsiderTransactions(txs: InsiderTx[], lookbackDays = 90): InsiderSignal {
  const cutoff = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10);
  const win = (txs ?? []).filter((t) => t && typeof t.date === 'string' && t.date >= cutoff);

  const buys = win.filter((t) => t.acquired && (t.code === 'P' || t.code === 'A'));
  const sells = win.filter((t) => !t.acquired && t.code === 'S');
  const val = (t: InsiderTx) => (Number.isFinite(t.value) && t.value > 0 ? t.value : Math.abs(t.shares * t.price) || 0);
  const buyValue = buys.reduce((s, t) => s + val(t), 0);
  const sellValue = sells.reduce((s, t) => s + val(t), 0);
  const uniqueBuyers = new Set(buys.map((t) => t.insider)).size;
  const uniqueSellers = new Set(sells.map((t) => t.insider)).size;

  const denom = buyValue + sellValue;
  const bias = denom > 0 ? ((buyValue - sellValue) / denom) * 100 : 0;
  const clusterBoost = Math.min(20, uniqueBuyers * 4) - Math.min(12, uniqueSellers * 2);
  // Thin samples should not produce extreme readings.
  const confidence = Math.min(1, (buys.length + sells.length) / 4);
  const score = Math.max(-100, Math.min(100, (bias + clusterBoost) * confidence));

  const label: InsiderSignal['label'] =
    score >= 55 ? 'strong_buy' : score >= 20 ? 'buy' : score <= -55 ? 'strong_sell' : score <= -20 ? 'sell' : 'neutral';

  const dates = win.map((t) => t.date).sort();
  return {
    score: Math.round(score),
    label,
    buys: buys.length,
    sells: sells.length,
    buyValue,
    sellValue,
    netValue: buyValue - sellValue,
    uniqueBuyers,
    uniqueSellers,
    cluster: uniqueBuyers >= 3,
    lastDate: dates.length ? dates[dates.length - 1] : null,
    lookbackDays,
    transactions: win.length,
  };
}

export function insiderSignalSentence(symbol: string, s: InsiderSignal): string {
  if (!s.transactions) return `${symbol}: no insider transactions disclosed in the last ${s.lookbackDays} days.`;
  const dir = s.netValue >= 0 ? 'net buying' : 'net selling';
  return `${symbol}: insider signal ${s.score > 0 ? '+' : ''}${s.score} (${s.label.replace('_', ' ')}) — ${dir} of ${Math.abs(Math.round(s.netValue)).toLocaleString()} over ${s.lookbackDays} days across ${s.transactions} filings, ${s.uniqueBuyers} distinct buyers and ${s.uniqueSellers} distinct sellers${s.cluster ? ', cluster buying detected' : ''}.`;
}
