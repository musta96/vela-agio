// =====================================================================
// Borsa Italiana — unlisted mutual funds ("Fondi comuni - Non quotati").
//
// Funds distributed in Italy but not exchange-listed (e.g. Morgan Stanley
// SICAV share classes) publish a daily NAV on borsaitaliana.it under an
// internal code (2FADB…). There is no public ISIN→code API: the FIDA
// results endpoint searches by fund name, and the ISIN only appears on
// the fund's detail page. Strategy:
//   1. curated ISIN→code map for known share classes (instant);
//   2. otherwise, name-search the FIDA endpoint and match the ISIN on a
//      bounded number of candidate detail pages.
// The detail page exposes the latest NAV, previous NAV, change % and the
// publication date — enough for a daily quote.
// =====================================================================

import { isIsin } from "./isin-resolver.ts";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const BASE = "https://www.borsaitaliana.it";

/** Curated ISIN → Borsa Italiana internal fund code. */
export const BI_FUND_CODES: Record<string, { code: string; name: string }> = {
  // Morgan Stanley Investment Funds — Global Opportunity A (USD), EUR-registered line
  LU0552385295: { code: "2FADB100678", name: "MSIF Global Opportunity A (USD) EUR" },
};

export type BIFundNav = {
  isin: string;
  code: string;
  name?: string;
  nav: number;
  previousNav?: number;
  changePct?: number;
  currency: string;
  /** ms epoch of the NAV publication date, when shown on the page. */
  asOf?: number;
  source: "borsa_italiana";
};

const codeCache = new Map<string, string | null>();

function parseItalianNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function firstMatch(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1] : null;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

/** Parse NAV + metadata from a fund detail page. Returns null if the page
 *  is not a fund sheet or does not carry the requested ISIN. */
export function parseBIFundDetail(html: string, isin: string, code: string): BIFundNav | null {
  if (!html.toUpperCase().includes(isin)) return null;
  const navRaw = firstMatch(html, /-formatPrice"[\s\S]{0,120}?<strong>([\d.,]+)<\/strong>/);
  const nav = navRaw ? parseItalianNumber(navRaw) : null;
  if (!nav || nav <= 0) return null;

  const prevRaw = firstMatch(html, /<th[^>]*>\s*Precedente[\s\S]{0,400}?<span[^>]*>([\d.,]+)<\/span>/)
    // The "Andamento" table lists Ultima then Precedente as the first two cells.
    ?? (() => {
      const cells = [...html.matchAll(/-size-xs">([\d.,]+)<\/span>/g)].map((m) => m[1]);
      return cells.length >= 2 ? cells[1] : null;
    })();
  const chgRaw = firstMatch(html, /-percPrice"[\s\S]{0,120}?<strong>([+-]?[\d.,]+)%<\/strong>/);
  const nameRaw = firstMatch(html, /Dettaglio Fondo[^<]*<\/title>/) ?? firstMatch(html, /<h1[^>]*>([^<]+)<\/h1>/);
  const dateRaw = firstMatch(html, /Data:\s*<strong>([\d]{2}\/[\d]{2}\/[\d]{2,4})<\/strong>/) ?? firstMatch(html, /-size-xs">([\d]{2}\/[\d]{2}\/[\d]{2,4})<\/span>/);

  let asOf: number | undefined;
  if (dateRaw) {
    const [d, m, y] = dateRaw.split("/").map(Number);
    const year = y < 100 ? 2000 + y : y;
    if (d && m && year) asOf = Date.UTC(year, m - 1, d);
  }

  const nav2 = nav;
  const previousNav = prevRaw ? parseItalianNumber(prevRaw) ?? undefined : undefined;
  const changePct = chgRaw ? parseItalianNumber(chgRaw) ?? undefined : undefined;
  return {
    isin,
    code,
    name: nameRaw?.replace(/\s+/g, " ").trim() || BI_FUND_CODES[isin]?.name,
    nav: nav2,
    previousNav,
    changePct,
    currency: "EUR",
    asOf,
    source: "borsa_italiana",
  };
}

async function detailPage(code: string): Promise<string | null> {
  return fetchText(`${BASE}/borsa/fondi/dettaglio/${code}.html`);
}

/** Resolve an ISIN to a Borsa Italiana internal fund code (cached). */
export async function findBIFundCode(isin: string, nameHint?: string): Promise<string | null> {
  const key = isin.toUpperCase();
  if (codeCache.has(key)) return codeCache.get(key)!;
  let code: string | null = BI_FUND_CODES[key]?.code ?? null;

  if (!code && nameHint) {
    const html = await fetchText(
      `${BASE}/borsa/fondi/fida/result.html?lang=en&productType=2&searchText=${encodeURIComponent(nameHint)}`,
    );
    if (html) {
      const candidates = [...new Set([...html.matchAll(/dettaglio\/([A-Z0-9]+)\.html/g)].map((m) => m[1]))].slice(0, 8);
      for (const cand of candidates) {
        const page = await detailPage(cand);
        if (page && page.toUpperCase().includes(key)) {
          code = cand;
          break;
        }
      }
    }
  }
  codeCache.set(key, code);
  return code;
}

/**
 * Latest NAV quote for an unlisted fund by ISIN. Returns null when the
 * fund is not published on Borsa Italiana's unlisted-funds section.
 */
export async function fetchBIFundNav(isinInput: string, nameHint?: string): Promise<BIFundNav | null> {
  const isin = (isinInput || "").trim().toUpperCase();
  if (!isIsin(isin)) return null;
  const code = await findBIFundCode(isin, nameHint);
  if (!code) return null;
  const html = await detailPage(code);
  if (!html) return null;
  return parseBIFundDetail(html, isin, code);
}
