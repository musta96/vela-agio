// Provider abstraction layer (P5 #24).
// Internal interface: getQuote, getBatchQuotes, getFundamentals,
// getMacroSeries, getNews, search. UI never calls vendors directly.
// Yahoo Finance is preserved as primary/fallback for equity quotes.

export type SourceTag =
  | "yahoo"
  | "fred"
  | "ecb_sdw"
  | "eurostat"
  | "fmp"
  | "alpha_vantage"
  | "cache";

export interface QuoteResult {
  symbol: string;
  price: number;
  previousClose: number;
  change: number; // percent
  currency?: string;
  marketState?: string;
  source: SourceTag;
  asOf: number; // unix ms
  stale?: boolean;
}

export interface MacroPoint { t: string; v: number }
export interface MacroSeriesResult {
  id: string;
  label: string;
  unit: string;
  source: SourceTag;
  asOf: number;
  points: MacroPoint[];
  stale?: boolean;
  notCovered?: boolean;
}

// ---------- Symbol normalization (P5 #26) ----------
// Canonical form: BASE[.EXCHSUFFIX]. ISIN → exchange suffix mapping
// (best-effort, EU MIC heuristics). Used both client- and server-side.
const ISIN_PREFIX_TO_SUFFIX: Record<string, string> = {
  IT: ".MI",
  FR: ".PA",
  DE: ".DE",
  ES: ".MC",
  NL: ".AS",
  BE: ".BR",
  CH: ".SW",
  GB: ".L",
  PT: ".LS",
  AT: ".VI",
  FI: ".HE",
  SE: ".ST",
  DK: ".CO",
  NO: ".OL",
  US: "", // NYSE/NASDAQ — no suffix on Yahoo
};

export function isIsin(s: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(s.trim().toUpperCase());
}

/**
 * Canonicalize a user-provided symbol/ISIN. We do NOT do an ISIN lookup
 * here (no free reliable endpoint); we strip duplicate suffixes, upper-case,
 * and collapse common synonyms (ENEL ↔ ENEL.MI on Italian context).
 */
export function normalizeSymbol(raw: string, hintCountry?: string): string {
  if (!raw) return raw;
  let s = raw.trim().toUpperCase();
  // Strip trailing exchange duplicates like "ENEL.MI.MI"
  s = s.replace(/(\.[A-Z]{1,3})\1+$/i, "$1");
  // If it's an ISIN, append exchange suffix from prefix map
  if (isIsin(s)) {
    const suffix = ISIN_PREFIX_TO_SUFFIX[s.slice(0, 2)] ?? "";
    // ISIN → ticker would need a paid mapping service.
    // Return ISIN unchanged but with a hint so the caller knows to resolve.
    return s + (suffix ? `@${suffix}` : "");
  }
  // Bare Italian large caps without suffix → add .MI
  if (!s.includes(".") && !s.includes("=") && !s.includes("^") && hintCountry === "IT") {
    s = `${s}.MI`;
  }
  return s;
}

/** Equality after normalization (used to dedupe holdings/watchlist). */
export function sameSymbol(a: string, b: string, hint?: string): boolean {
  return normalizeSymbol(a, hint) === normalizeSymbol(b, hint);
}

// ---------- Macro series (P5 #25) ----------
// FRED requires a free API key; ECB SDW and Eurostat are key-less.
// We always set source + asOf and degrade gracefully.

const FRED_KEY = Deno.env.get("FRED_API_KEY") ?? "";

async function fetchFred(seriesId: string): Promise<MacroSeriesResult | null> {
  if (!FRED_KEY) return null;
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(
    seriesId,
  )}&api_key=${FRED_KEY}&file_type=json&observation_start=${
    new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  }`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    const points: MacroPoint[] = (j.observations ?? [])
      .map((o: any) => ({ t: o.date, v: parseFloat(o.value) }))
      .filter((p: MacroPoint) => Number.isFinite(p.v));
    if (!points.length) return null;
    return {
      id: seriesId,
      label: seriesId,
      unit: "%",
      source: "fred",
      asOf: Date.now(),
      points,
    };
  } catch {
    return null;
  }
}

async function fetchEcbSdw(flowKey: string, label: string, unit = "%"): Promise<MacroSeriesResult | null> {
  // ECB SDW JSON endpoint — no key required.
  const url = `https://data-api.ecb.europa.eu/service/data/${flowKey}?format=jsondata&lastNObservations=260`;
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    const series = j?.dataSets?.[0]?.series;
    if (!series) return null;
    const firstKey = Object.keys(series)[0];
    const obs = series[firstKey]?.observations ?? {};
    const dim = j?.structure?.dimensions?.observation?.[0]?.values ?? [];
    const points: MacroPoint[] = Object.entries(obs)
      .map(([idx, val]: [string, any]) => ({
        t: dim[parseInt(idx, 10)]?.id ?? idx,
        v: Array.isArray(val) ? val[0] : val,
      }))
      .filter((p) => Number.isFinite(p.v));
    if (!points.length) return null;
    return { id: flowKey, label, unit, source: "ecb_sdw", asOf: Date.now(), points };
  } catch {
    return null;
  }
}

async function fetchEurostat(dataset: string, params: string, label: string, unit = "%"): Promise<MacroSeriesResult | null> {
  const url = `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}?${params}&format=JSON`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    const timeDim = j?.dimension?.time?.category?.index ?? {};
    const values = j?.value ?? {};
    const points: MacroPoint[] = Object.entries(timeDim)
      .map(([t, idx]: [string, any]) => ({ t, v: values[idx] }))
      .filter((p) => Number.isFinite(p.v));
    if (!points.length) return null;
    return { id: dataset, label, unit, source: "eurostat", asOf: Date.now(), points };
  } catch {
    return null;
  }
}

/** Curated macro catalog mapping a logical id → preferred provider chain. */
export async function getMacroSeries(id: string): Promise<MacroSeriesResult> {
  switch (id) {
    case "us_10y":
      return (await fetchFred("DGS10")) ?? notCovered(id, "US 10Y Treasury", "%");
    case "us_2y":
      return (await fetchFred("DGS2")) ?? notCovered(id, "US 2Y Treasury", "%");
    case "us_cpi_yoy":
      return (await fetchFred("CPIAUCSL")) ?? notCovered(id, "US CPI", "index");
    case "ecb_mro":
      return (
        (await fetchEcbSdw("FM/B.U2.EUR.4F.KR.MRR_FR.LEV", "ECB MRO", "%")) ??
        notCovered(id, "ECB Main Refi Rate", "%")
      );
    case "ecb_depo":
      return (
        (await fetchEcbSdw("FM/B.U2.EUR.4F.KR.DFR.LEV", "ECB Deposit Facility", "%")) ??
        notCovered(id, "ECB Deposit Facility", "%")
      );
    case "eur_hicp_yoy":
      return (
        (await fetchEurostat("prc_hicp_manr", "geo=EA&coicop=CP00", "Euro Area HICP YoY", "%")) ??
        notCovered(id, "Euro Area HICP YoY", "%")
      );
    case "ea_unemployment":
      return (
        (await fetchEurostat("une_rt_m", "geo=EA20&s_adj=SA&age=TOTAL&sex=T&unit=PC_ACT", "EA Unemployment", "%")) ??
        notCovered(id, "EA Unemployment", "%")
      );
    default:
      return notCovered(id, id, "");
  }
}

function notCovered(id: string, label: string, unit: string): MacroSeriesResult {
  return { id, label, unit, source: "cache", asOf: Date.now(), points: [], notCovered: true };
}