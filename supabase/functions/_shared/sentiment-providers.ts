// Real, quantitative sentiment feeds.
//
// These return sentiment values computed by the providers themselves (not an
// LLM guess and not a keyword heuristic), so the stock page can show live
// scores even when AI credits are unavailable.
//
//  - StockTwits  : free, no key. Real retail messages tagged Bullish/Bearish.
//  - Alpha Vantage NEWS_SENTIMENT : per-article ticker sentiment scores.
//  - Marketaux   : entity-level sentiment score per article.
//  - Finnhub     : company news sentiment + bullish percent (US coverage).
//
// Every helper fails silently (returns null / []) so a missing key or a bad
// upstream never breaks the analysis.

import { getUserDataKey } from './data-provider.ts';

export interface SentimentReading {
  /** Provider label shown to the user. */
  provider: string;
  /** 0-100, 50 = neutral. */
  score: number;
  /** How many messages / articles the score is based on. */
  sampleSize: number;
  /** Short human explanation of what was measured. */
  detail: string;
  /** Optional per-article scores keyed by article URL. */
  articleScores?: { url: string; title?: string; score: number }[];
}

const base = (s: string) => s.split('.')[0].split('-')[0].toUpperCase();
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
/** Provider scales run -1..1; map to 0..100. */
const fromSigned = (v: number) => clamp(50 + v * 50);

async function timed(url: string, init?: RequestInit, ms = 9000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** StockTwits — real crowd sentiment, free and keyless. */
export async function fetchStocktwitsSentiment(symbol: string): Promise<SentimentReading | null> {
  const r = await timed(`https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(base(symbol))}.json`, {
    headers: { Accept: 'application/json' },
  });
  if (!r || !r.ok) return null;
  try {
    const j = await r.json();
    const msgs: unknown[] = Array.isArray(j?.messages) ? j.messages : [];
    let bull = 0;
    let bear = 0;
    for (const m of msgs) {
      const basic = (m as { entities?: { sentiment?: { basic?: string } } })?.entities?.sentiment?.basic;
      if (basic === 'Bullish') bull++;
      else if (basic === 'Bearish') bear++;
    }
    const tagged = bull + bear;
    if (tagged < 3) return null;
    return {
      provider: 'StockTwits',
      score: clamp((bull / tagged) * 100),
      sampleSize: tagged,
      detail: `${bull} bullish vs ${bear} bearish tagged messages from retail traders in the last stream.`,
    };
  } catch {
    return null;
  }
}

/** Alpha Vantage NEWS_SENTIMENT — per-article scores tied to the ticker. */
export async function fetchAlphaVantageSentiment(authHeader: string | null, symbol: string): Promise<SentimentReading | null> {
  const key = await getUserDataKey(authHeader, 'ALPHA_VANTAGE_API_KEY');
  if (!key) return null;
  const sym = base(symbol);
  const r = await timed(`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${sym}&limit=50&apikey=${key}`);
  if (!r || !r.ok) return null;
  try {
    const j = await r.json();
    const feed: unknown[] = Array.isArray(j?.feed) ? j.feed : [];
    const scores: { url: string; title?: string; score: number }[] = [];
    for (const item of feed) {
      const it = item as { url?: string; title?: string; ticker_sentiment?: { ticker?: string; ticker_sentiment_score?: string }[] };
      const hit = (it.ticker_sentiment ?? []).find((t) => (t.ticker ?? '').toUpperCase() === sym);
      const raw = hit ? Number(hit.ticker_sentiment_score) : NaN;
      if (!Number.isFinite(raw) || !it.url) continue;
      // Alpha Vantage scores sit roughly in -0.35..0.35; widen to use the scale.
      scores.push({ url: it.url, title: it.title, score: fromSigned(Math.max(-1, Math.min(1, raw * 2.5))) });
    }
    if (!scores.length) return null;
    const avg = scores.reduce((s, x) => s + x.score, 0) / scores.length;
    return {
      provider: 'Alpha Vantage news sentiment',
      score: clamp(avg),
      sampleSize: scores.length,
      detail: `Ticker-tagged sentiment across ${scores.length} scored articles.`,
      articleScores: scores,
    };
  } catch {
    return null;
  }
}

/** Marketaux — entity sentiment score per article. */
export async function fetchMarketauxSentiment(authHeader: string | null, symbol: string): Promise<SentimentReading | null> {
  const key = await getUserDataKey(authHeader, 'MARKETAUX_API_KEY');
  if (!key) return null;
  const sym = base(symbol);
  const r = await timed(
    `https://api.marketaux.com/v1/news/all?symbols=${sym}&language=en&filter_entities=true&limit=50&api_token=${key}`,
  );
  if (!r || !r.ok) return null;
  try {
    const j = await r.json();
    const data: unknown[] = Array.isArray(j?.data) ? j.data : [];
    const scores: { url: string; title?: string; score: number }[] = [];
    for (const item of data) {
      const it = item as { url?: string; title?: string; entities?: { symbol?: string; sentiment_score?: number }[] };
      const hit = (it.entities ?? []).find((e) => (e.symbol ?? '').toUpperCase().startsWith(sym));
      if (!it.url || !hit || typeof hit.sentiment_score !== 'number') continue;
      scores.push({ url: it.url, title: it.title, score: fromSigned(hit.sentiment_score) });
    }
    if (!scores.length) return null;
    const avg = scores.reduce((s, x) => s + x.score, 0) / scores.length;
    return {
      provider: 'Marketaux entity sentiment',
      score: clamp(avg),
      sampleSize: scores.length,
      detail: `Entity-level sentiment on ${scores.length} articles that name this company.`,
      articleScores: scores,
    };
  } catch {
    return null;
  }
}

/** Finnhub news sentiment — bullish percent + company news score (US names). */
export async function fetchFinnhubSentiment(authHeader: string | null, symbol: string): Promise<SentimentReading | null> {
  const key = await getUserDataKey(authHeader, 'FINNHUB_API_KEY');
  if (!key) return null;
  const r = await timed(`https://finnhub.io/api/v1/news-sentiment?symbol=${base(symbol)}&token=${key}`);
  if (!r || !r.ok) return null;
  try {
    const j = await r.json();
    const bullish = Number(j?.sentiment?.bullishPercent);
    const articles = Number(j?.buzz?.articlesInLastWeek);
    if (!Number.isFinite(bullish)) return null;
    return {
      provider: 'Finnhub news sentiment',
      score: clamp(bullish * 100),
      sampleSize: Number.isFinite(articles) ? articles : 0,
      detail: `${Math.round(bullish * 100)}% of scored company news in the last week reads bullish.`,
    };
  } catch {
    return null;
  }
}

/** Run every available real-sentiment feed in parallel. */
export async function fetchRealSentiment(authHeader: string | null, symbol: string): Promise<SentimentReading[]> {
  const results = await Promise.all([
    fetchStocktwitsSentiment(symbol),
    fetchAlphaVantageSentiment(authHeader, symbol),
    fetchMarketauxSentiment(authHeader, symbol),
    fetchFinnhubSentiment(authHeader, symbol),
  ]);
  return results.filter((r): r is SentimentReading => !!r && Number.isFinite(r.score));
}

/**
 * Blend the readings into one score. News-scoring providers carry more weight
 * than raw crowd chatter, and bigger samples count for more within a provider.
 */
export function blendReadings(readings: SentimentReading[]): { score: number; weightTotal: number } | null {
  if (!readings.length) return null;
  const baseWeight: Record<string, number> = {
    'Alpha Vantage news sentiment': 3,
    'Marketaux entity sentiment': 3,
    'Finnhub news sentiment': 2.5,
    StockTwits: 1,
  };
  let num = 0;
  let den = 0;
  for (const r of readings) {
    const conf = Math.min(1, Math.max(0.3, r.sampleSize / 25));
    const w = (baseWeight[r.provider] ?? 1) * conf;
    num += r.score * w;
    den += w;
  }
  if (den === 0) return null;
  return { score: clamp(num / den), weightTotal: den };
}
