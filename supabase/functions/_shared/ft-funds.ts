// =====================================================================
// FT Markets — unlisted mutual funds & ETFs by ISIN.
//
// Many funds distributed in Europe are not exchange-listed and therefore
// invisible to Yahoo. FT publishes a daily NAV plus reference data
// (currency, ongoing charge, fund size, domicile, income treatment,
// Morningstar category) and, on the ratings sheet, the Morningstar star
// rating. This is the widest free-of-charge ISIN-addressable source we
// have; Bloomberg has no comparable public feed.
// =====================================================================

import { isIsin } from "./isin-resolver.ts";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const BASE = "https://markets.ft.com/data/funds/tearsheet";

export type FTFundData = {
  isin: string;
  name?: string | null;
  nav: number | null;
  currency: string | null;
  /** ms epoch of the NAV date, when the page states it. */
  asOf?: number;
  changePct?: number | null;
  fundType?: string | null;
  incomeTreatment?: string | null;
  morningstarCategory?: string | null;
  launchDate?: string | null;
  domicile?: string | null;
  /** Ongoing charge as a fraction (0.0285 = 2.85%). */
  ter?: number | null;
  fundSize?: number | null;
  fundSizeCurrency?: string | null;
  morningstarOverall?: number | null;
  morningstarAsOf?: string | null;
  source: "ft";
};

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en" },
      redirect: "follow",
    });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

function num(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, "").replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Key/value rows of the FT "Fund details" table. */
function detailRows(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<th[^>]*>([^<]{2,60})<\/th>\s*<td[^>]*>([\s\S]{0,300}?)<\/td>/g)) {
    const k = strip(m[1]).toLowerCase();
    if (k && !(k in out)) out[k] = strip(m[2]);
  }
  return out;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseFtDate(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const m = raw.match(/([A-Za-z]{3})[a-z]*\s+(\d{1,2})\s+(\d{4})/);
  if (!m) return undefined;
  const mo = MONTHS[m[1].toLowerCase()];
  if (mo === undefined) return undefined;
  return Date.UTC(Number(m[3]), mo, Number(m[2]));
}

/** Money strings like "404.36m GBP" → absolute amount + currency. */
function parseSize(raw: string | undefined): { value: number | null; currency: string | null } {
  if (!raw) return { value: null, currency: null };
  const m = raw.match(/([\d.,]+)\s*([kmbn]{1,2})?\s*([A-Z]{3})?/i);
  if (!m) return { value: null, currency: null };
  const base = num(m[1]);
  if (base == null) return { value: null, currency: m[3] ?? null };
  const mult = { k: 1e3, m: 1e6, b: 1e9, bn: 1e9 }[(m[2] || "").toLowerCase()] ?? 1;
  return { value: base * mult, currency: m[3] ?? null };
}

export function parseFtSummary(html: string, isin: string): FTFundData | null {
  const rows = detailRows(html);
  const rowIsin = (rows["isin"] || "").toUpperCase();
  if (rowIsin && rowIsin !== isin) return null;

  const priceBlock = html.match(/mod-tearsheet-overview__quote">([\s\S]{0,600})/)?.[1] ?? "";
  const currency = priceBlock.match(/Price\s*\(([A-Za-z]{2,4})\)/)?.[1]?.toUpperCase() ?? null;
  const nav = num(priceBlock.match(/Price\s*\([A-Za-z]{2,4}\)[\s\S]{0,200}?>([\d.,]+)</)?.[1]);
  // Only the overview block carries the daily move; elsewhere on the page
  // "%" values are performance figures that would look like a 500% day.
  const rawChange = num(priceBlock.match(/mod-format--(?:pos|neg)[^>]*>\s*([+-]?[\d.,]+)%/)?.[1]);
  const changePct = rawChange != null && Math.abs(rawChange) <= 50 ? rawChange : null;
  const name = strip(html.match(/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/)?.[1] ?? "") || null;
  const asOf =
    parseFtDate(html.match(/as of ([A-Za-z]{3,9}\s+\d{1,2}\s+\d{4})/i)?.[1] ?? null) ??
    parseFtDate(rows["fund size"] ?? null);

  const ongoing = num(rows["ongoing charge"] ?? null);
  const size = parseSize(rows["share class size"] || rows["fund size"]);

  if (nav == null && !rowIsin) return null;

  return {
    isin,
    name,
    nav,
    currency,
    asOf,
    changePct,
    fundType: rows["fund type"] || null,
    incomeTreatment: rows["income treatment"] || null,
    morningstarCategory: rows["morningstar category"] || null,
    launchDate: rows["launch date"] || null,
    domicile: rows["domicile"] || null,
    ter: ongoing != null ? ongoing / 100 : null,
    fundSize: size.value,
    fundSizeCurrency: size.currency ?? currency,
    source: "ft",
  };
}

/** Morningstar star rating (1–5) from the FT ratings sheet. */
export function parseFtRatings(html: string): { stars: number | null; asOf: string | null; category: string | null } {
  const block = html.match(/mod-morningstar-rating-app__overall-rating([\s\S]{0,2500})/)?.[1] ?? "";
  const highlighted = block.match(/data-mod-stars-highlighted="true"[^>]*>([\s\S]{0,600}?)<\/span>/)?.[1] ?? "";
  const stars = (highlighted.match(/star--filled/g) || []).length || null;
  const asOf = strip(block.match(/heading-disclaimer"[^>]*>([^<]{0,60})</)?.[1] ?? "").replace(/^As of\s*/i, "") || null;
  const category = strip(
    block.match(/mod-morningstar-rating-app__category[\s\S]{0,400}?<span>([^<]{0,80})</)?.[1] ?? "",
  ) || null;
  return { stars: stars && stars >= 1 && stars <= 5 ? stars : null, asOf, category };
}

/**
 * Full FT record for an ISIN: NAV + reference data + Morningstar rating.
 * Returns null when FT does not cover the ISIN.
 */
export async function fetchFtFund(isinInput: string): Promise<FTFundData | null> {
  const isin = (isinInput || "").trim().toUpperCase();
  if (!isIsin(isin)) return null;

  const summaryHtml = await fetchText(`${BASE}/summary?s=${isin}`);
  if (!summaryHtml) return null;
  const data = parseFtSummary(summaryHtml, isin);
  if (!data) return null;

  const ccy = data.currency ?? "EUR";
  const ratingsHtml = await fetchText(`${BASE}/ratings?s=${isin}:${ccy}`);
  if (ratingsHtml) {
    const r = parseFtRatings(ratingsHtml);
    data.morningstarOverall = r.stars;
    data.morningstarAsOf = r.asOf;
    if (!data.morningstarCategory) data.morningstarCategory = r.category;
  }
  return data;
}
