// Unified quote resolver with a prioritized provider chain.
//
// Order (each step is skipped silently if its credentials aren't configured
// or if it returns no usable price):
//   1. Yahoo Finance        — no auth, widest coverage, but flaky 401/429.
//   2. Stooq                — no auth, free CSV, broad equity / FX / crypto
//                             coverage. Already used as the primary fallback.
//   3. Finnhub              — needs FINNHUB_API_KEY. Free tier supports US
//                             equities and FX.
//   4. Alpaca Market Data   — needs ALPACA_API_KEY + ALPACA_SECRET_KEY (or
//                             ALPACA_API_SECRET). Free IEX-tier covers US
//                             equities and a number of crypto pairs.
//   5. Twelve Data          — needs TWELVE_DATA_API_KEY. Broad asset coverage
//                             (equities, FX, crypto, indices) on the free tier.
//
// Every provider returns the same `UnifiedQuote` shape and is fully isolated:
// any exception, non-2xx response, or missing field is logged once and
// treated as "try the next provider". The chain never throws — callers get
// either a quote or a structured `{ error, attempts }` object so the calling
// AI tool / API endpoint can surface the diagnostic to the user.

import { fetchStooqQuote } from "./stooq.ts";

export type UnifiedQuote = {
  symbol: string;
  name?: string;
  price: number;
  currency?: string;
  exchange?: string;
  changePct?: number;
  dayHigh?: number;
  dayLow?: number;
  marketCap?: number;
  peTrailing?: number;
  dividendYield?: number;
  previousClose?: number;
  updatedAt?: number;
  asOf?: number;
  source: "yahoo" | "stooq" | "finnhub" | "alpaca" | "twelvedata";
};

export type ProviderAttempt = {
  provider: UnifiedQuote["source"];
  ok: boolean;
  reason?: string;
};

export type QuoteFailure = {
  error: string;
  attempts: ProviderAttempt[];
};

function envAny(...names: string[]): string | undefined {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

// ---------- providers --------------------------------------------------------

const YF_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Alternative listings to try when the requested Yahoo symbol is unknown.
 * German listings in particular exist under several venue suffixes
 * (`.DE` Xetra, `.F` Frankfurt, `.SG` Stuttgart, `.MU` Munich).
 */
function yahooVariants(symbol: string): string[] {
  const s = symbol.trim();
  const out = [s];
  const m = s.match(/^([^.]+)\.([A-Z]+)$/i);
  if (m) {
    const [, base, suf] = m;
    const group: Record<string, string[]> = {
      DE: ["F", "SG", "MU", "BE"],
      F: ["DE", "SG", "MU"],
      SG: ["DE", "F"],
      MU: ["DE", "F"],
      MI: ["MI"],
    };
    for (const alt of group[suf.toUpperCase()] ?? []) {
      const cand = `${base}.${alt}`;
      if (!out.includes(cand)) out.push(cand);
    }
  }
  return out;
}

/**
 * Yahoo quotes via the v8 chart endpoint. The older v7 `quote` API now
 * requires a crumb/cookie session and answers 401, which silently pushed
 * every non-US listing down the chain onto US-only providers.
 */
async function fromYahoo(symbol: string): Promise<UnifiedQuote | { reason: string }> {
  let lastReason = "no quote";
  for (const sym of yahooVariants(symbol)) {
    for (const host of ["query1", "query2"]) {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;
      try {
        const r = await fetch(url, { headers: { "User-Agent": YF_UA, Accept: "application/json" } });
        if (!r.ok) { lastReason = `http ${r.status}`; continue; }
        const j = await r.json();
        const m = j?.chart?.result?.[0]?.meta;
        const price = m?.regularMarketPrice;
        if (typeof price !== "number" || !(price > 0)) { lastReason = "no quote"; continue; }
        const prev = typeof m.chartPreviousClose === "number" ? m.chartPreviousClose : m.previousClose;
        return {
          symbol,
          name: m.longName ?? m.shortName,
          price,
          currency: m.currency,
          exchange: m.fullExchangeName ?? m.exchangeName,
          changePct: typeof prev === "number" && prev > 0 ? ((price - prev) / prev) * 100 : undefined,
          dayHigh: m.regularMarketDayHigh,
          dayLow: m.regularMarketDayLow,
          previousClose: typeof prev === "number" ? prev : undefined,
          updatedAt: Date.now(),
          asOf: m.regularMarketTime ? m.regularMarketTime * 1000 : Date.now(),
          source: "yahoo",
        };
      } catch (e) {
        lastReason = (e as Error)?.message ?? "fetch failed";
      }
    }
  }
  return { reason: lastReason };
}


async function fromStooq(symbol: string): Promise<UnifiedQuote | { reason: string }> {
  try {
    const sq = await fetchStooqQuote(symbol);
    if (!sq) return { reason: "no symbol mapping or empty csv" };
    return {
      symbol,
      price: sq.price,
      currency: sq.currency,
      changePct: sq.change,
      previousClose: sq.previousClose,
      updatedAt: sq.updatedAt,
      asOf: sq.asOf,
      source: "stooq",
    };
  } catch (e) {
    return { reason: (e as Error)?.message ?? "stooq failed" };
  }
}

async function fromFinnhub(symbol: string): Promise<UnifiedQuote | { reason: string }> {
  const key = envAny("FINNHUB_API_KEY");
  if (!key) return { reason: "no api key configured" };
  // Finnhub's free tier only covers US listings under the bare ticker.
  // Stripping a venue suffix (SGLD.MI → SGLD) silently resolves a DIFFERENT
  // security, so foreign listings must never be sent here.
  if (symbol.includes("=") || symbol.startsWith("^") || symbol.includes(".")) {
    return { reason: "symbol class not supported by free tier" };
  }
  const sym = symbol.toUpperCase();

  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${key}`);
    if (!r.ok) return { reason: `http ${r.status}` };
    const j = await r.json();
    // c=current, pc=previous close, h/l=day high/low, t=unix
    if (typeof j?.c !== "number" || j.c <= 0) return { reason: "no quote" };
    return {
      symbol,
      price: j.c,
      previousClose: j.pc,
      changePct: j.pc ? ((j.c - j.pc) / j.pc) * 100 : undefined,
      dayHigh: j.h,
      dayLow: j.l,
      asOf: typeof j.t === "number" ? j.t * 1000 : Date.now(),
      updatedAt: Date.now(),
      source: "finnhub",
    };
  } catch (e) {
    return { reason: (e as Error)?.message ?? "finnhub failed" };
  }
}

async function fromAlpaca(symbol: string): Promise<UnifiedQuote | { reason: string }> {
  const key = envAny("ALPACA_API_KEY", "ALPACA_KEY_ID");
  const secret = envAny("ALPACA_SECRET_KEY", "ALPACA_API_SECRET");
  if (!key || !secret) return { reason: "no api key configured" };
  // Detect crypto pairs like BTC-USD / ETH-USDT and route to the crypto API.
  const cryptoMatch = symbol.match(/^([A-Z]{2,6})-(USD|USDT|USDC|EUR)$/i);
  try {
    if (cryptoMatch) {
      const pair = `${cryptoMatch[1].toUpperCase()}/${cryptoMatch[2].toUpperCase()}`;
      const r = await fetch(
        `https://data.alpaca.markets/v1beta3/crypto/us/latest/trades?symbols=${encodeURIComponent(pair)}`,
        { headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret } },
      );
      if (!r.ok) return { reason: `http ${r.status}` };
      const j = await r.json();
      const t = j?.trades?.[pair];
      if (!t || typeof t.p !== "number") return { reason: "no trade" };
      return { symbol, price: t.p, updatedAt: Date.now(), asOf: Date.parse(t.t) || Date.now(), source: "alpaca" };
    }
    // US equities. Skip foreign listings (Yahoo suffixes) and FX/index/futures.
    if (symbol.includes(".") || symbol.includes("=") || symbol.startsWith("^")) {
      return { reason: "symbol class not supported" };
    }
    const r = await fetch(
      `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/trades/latest?feed=iex`,
      { headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret } },
    );
    if (!r.ok) return { reason: `http ${r.status}` };
    const j = await r.json();
    const t = j?.trade;
    if (!t || typeof t.p !== "number") return { reason: "no trade" };
    return { symbol, price: t.p, updatedAt: Date.now(), asOf: Date.parse(t.t) || Date.now(), source: "alpaca" };
  } catch (e) {
    return { reason: (e as Error)?.message ?? "alpaca failed" };
  }
}

async function fromTwelveData(symbol: string): Promise<UnifiedQuote | { reason: string }> {
  const key = envAny("TWELVE_DATA_API_KEY", "TWELVEDATA_API_KEY");
  if (!key) return { reason: "no api key configured" };
  // Twelve Data uses its own symbol format; pass through equity tickers and
  // best-effort map FX (EURUSD=X → EUR/USD) and crypto (BTC-USD → BTC/USD).
  // Venue suffixes must become an explicit MIC, otherwise the bare ticker
  // would resolve to a same-named US security.
  let sym = symbol;
  let mic = "";
  const fx = symbol.match(/^([A-Z]{3})([A-Z]{3})=X$/i);
  if (fx) sym = `${fx[1].toUpperCase()}/${fx[2].toUpperCase()}`;
  const cr = symbol.match(/^([A-Z]{2,6})-(USD|EUR|USDT|USDC)$/i);
  if (cr) sym = `${cr[1].toUpperCase()}/${cr[2].toUpperCase()}`;
  const venue = symbol.match(/^([^.]+)\.([A-Z]+)$/i);
  if (!fx && !cr && venue) {
    const MIC: Record<string, string> = {
      MI: "XMIL", AS: "XAMS", DE: "XETR", F: "XFRA", SG: "XSTU", MU: "XMUN",
      PA: "XPAR", BR: "XBRU", LS: "XLIS", MC: "XMAD", L: "XLON", SW: "XSWX",
      ST: "XSTO", HE: "XHEL", CO: "XCSE", OL: "XOSL", VI: "XWBO", WA: "XWAR",
      IR: "XDUB", TO: "XTSE", T: "XTKS", HK: "XHKG", AX: "XASX",
    };
    const code = MIC[venue[2].toUpperCase()];
    if (!code) return { reason: "unmapped exchange suffix" };
    sym = venue[1].toUpperCase();
    mic = `&mic_code=${code}`;
  }
  try {
    const r = await fetch(
      `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(sym)}${mic}&apikey=${key}`,
    );
    if (!r.ok) return { reason: `http ${r.status}` };

    const j = await r.json();
    const price = Number(j?.close ?? j?.price);
    if (!Number.isFinite(price) || price <= 0) {
      return { reason: j?.message || j?.status || "no quote" };
    }
    return {
      symbol,
      name: j.name,
      price,
      currency: j.currency,
      exchange: j.exchange,
      previousClose: Number(j.previous_close) || undefined,
      changePct: Number(j.percent_change) || undefined,
      dayHigh: Number(j.high) || undefined,
      dayLow: Number(j.low) || undefined,
      updatedAt: Date.now(),
      source: "twelvedata",
    };
  } catch (e) {
    return { reason: (e as Error)?.message ?? "twelvedata failed" };
  }
}

// ---------- orchestrator ----------------------------------------------------

type Provider = {
  name: UnifiedQuote["source"];
  fetch: (symbol: string) => Promise<UnifiedQuote | { reason: string }>;
};

const PROVIDERS: Provider[] = [
  { name: "yahoo", fetch: fromYahoo },
  { name: "stooq", fetch: fromStooq },
  { name: "finnhub", fetch: fromFinnhub },
  { name: "alpaca", fetch: fromAlpaca },
  { name: "twelvedata", fetch: fromTwelveData },
];

export type FetchQuoteOptions = {
  /** Skip these providers (e.g. when one is known-broken for this symbol). */
  skip?: UnifiedQuote["source"][];
  /** Hard per-provider timeout in ms. Default 4500. */
  timeoutMs?: number;
};

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms (${label})`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/**
 * Resolve a single quote by walking the prioritized provider chain.
 * Never throws. Returns a quote on success or `{ error, attempts }` on full
 * exhaustion so callers can log/surface the failure.
 */
export async function fetchQuoteWithFallback(
  symbol: string,
  opts: FetchQuoteOptions = {},
): Promise<UnifiedQuote | QuoteFailure> {
  const sym = (symbol || "").trim();
  if (!sym) return { error: "empty symbol", attempts: [] };
  const skip = new Set(opts.skip ?? []);
  const timeoutMs = opts.timeoutMs ?? 4500;
  const attempts: ProviderAttempt[] = [];
  for (const p of PROVIDERS) {
    if (skip.has(p.name)) {
      attempts.push({ provider: p.name, ok: false, reason: "skipped" });
      continue;
    }
    try {
      const res = await withTimeout(p.fetch(sym), timeoutMs, p.name);
      if ("price" in res && typeof res.price === "number" && res.price > 0) {
        attempts.push({ provider: p.name, ok: true });
        return res;
      }
      attempts.push({ provider: p.name, ok: false, reason: (res as { reason?: string }).reason ?? "no quote" });
    } catch (e) {
      attempts.push({ provider: p.name, ok: false, reason: (e as Error)?.message ?? "error" });
    }
  }
  return { error: `all providers failed for ${sym}`, attempts };
}

/** Convenience: best-effort quote that returns null on full failure. */
export async function fetchQuoteOrNull(symbol: string, opts?: FetchQuoteOptions): Promise<UnifiedQuote | null> {
  const r = await fetchQuoteWithFallback(symbol, opts);
  return "price" in r ? r : null;
}