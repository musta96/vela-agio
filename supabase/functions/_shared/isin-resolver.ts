// =====================================================================
// ISIN → tradable symbol resolution.
//
// Mutual funds (FAM MegaTrends, Morgan Stanley SICAVs, Algebris UCITS…)
// have no exchange ticker: they are only addressable by ISIN, and Yahoo
// exposes them under an internal `0P00…` performance-id symbol.
//
// This resolver turns an ISIN — or a bare fund/ETF name — into the symbol
// the quote and OHLC providers understand, and caches the mapping so we
// only pay the lookup once per instrument.
// =====================================================================

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

export function isIsin(value: string): boolean {
  return ISIN_RE.test((value || "").trim().toUpperCase());
}

export type ResolvedSymbol = {
  /** Symbol usable against Yahoo chart / quote endpoints. */
  symbol: string;
  name?: string;
  currency?: string;
  exchange?: string;
  quoteType?: string;
  /** The ISIN this came from, when the lookup started from one. */
  isin?: string;
};

const memory = new Map<string, ResolvedSymbol | null>();

/**
 * Look an ISIN (or free-text fund name) up on Yahoo's search endpoint.
 * Prefers a listed ETF/equity line over a mutual-fund NAV line when both
 * exist, and prefers EUR venues for European ISINs so the price the user
 * sees matches their broker statement.
 */
export async function resolveIsin(query: string): Promise<ResolvedSymbol | null> {
  const q = (query || "").trim();
  if (!q) return null;
  const cacheKey = q.toUpperCase();
  if (memory.has(cacheKey)) return memory.get(cacheKey)!;

  let out: ResolvedSymbol | null = null;
  for (const host of ["query2", "query1"]) {
    try {
      const r = await fetch(
        `https://${host}.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&listsCount=0`,
        { headers: { "User-Agent": UA, Accept: "application/json" } },
      );
      if (!r.ok) continue;
      const j = await r.json();
      const quotes: Array<Record<string, unknown>> = j?.quotes ?? [];
      const usable = quotes.filter((it) => typeof it.symbol === "string" && it.quoteType !== "OPTION");
      if (usable.length === 0) continue;

      const isEuroIsin = isIsin(q) && /^(IE|LU|IT|DE|FR|NL|ES|BE|PT|AT|FI|GB|CH)/.test(cacheKey);
      const rank = (it: Record<string, unknown>) => {
        const type = String(it.quoteType || "").toUpperCase();
        const sym = String(it.symbol);
        let s = type === "ETF" ? 100 : type === "EQUITY" ? 90 : type === "MUTUALFUND" ? 80 : 40;
        // European listings first for European ISINs.
        if (isEuroIsin && /\.(MI|AS|DE|F|PA|L|SW|MC|BR|LS|IR|VI)$/i.test(sym)) s += 25;
        // Yahoo's internal fund ids are valid but last-choice among equals.
        if (/^0P/i.test(sym)) s -= 5;
        return s;
      };
      const best = [...usable].sort((a, b) => rank(b) - rank(a))[0];
      out = {
        symbol: String(best.symbol),
        name: (best.shortname as string) || (best.longname as string) || undefined,
        exchange: (best.exchDisp as string) || (best.exchange as string) || undefined,
        quoteType: (best.quoteType as string) || undefined,
        isin: isIsin(q) ? cacheKey : undefined,
      };
      break;
    } catch {
      /* try next host */
    }
  }

  memory.set(cacheKey, out);
  return out;
}

/**
 * Normalize whatever the client sent (ticker, ISIN, or fund id) into a
 * symbol the providers can price. Non-ISIN input is returned untouched.
 */
export async function toQuotableSymbol(input: string): Promise<{ symbol: string; resolved?: ResolvedSymbol }> {
  const s = (input || "").trim();
  if (!isIsin(s)) return { symbol: s };
  const resolved = await resolveIsin(s.toUpperCase());
  return resolved ? { symbol: resolved.symbol, resolved } : { symbol: s };
}
