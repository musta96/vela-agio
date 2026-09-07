// Geography helpers — map a listing (Yahoo-style symbol), an issuer country or
// a fund name to a country and a broad region, so exposure can be segmented
// the way a private investor thinks about it (Italy / Europe / US / Asia …).

export interface GeoInfo {
  code: string;      // ISO-2 country code
  country: string;   // human label
  region: string;    // broad region label
}

const REGION_BY_CODE: Record<string, string> = {
  US: "North America", CA: "North America", MX: "North America",
  IT: "Europe", DE: "Europe", FR: "Europe", NL: "Europe", ES: "Europe", PT: "Europe",
  BE: "Europe", IE: "Europe", AT: "Europe", CH: "Europe", GB: "United Kingdom",
  SE: "Europe", NO: "Europe", DK: "Europe", FI: "Europe", IS: "Europe", PL: "Europe",
  CZ: "Europe", GR: "Europe", HU: "Europe", TR: "Europe", RU: "Europe",
  JP: "Asia-Pacific", CN: "China", HK: "China", TW: "Asia-Pacific", KR: "Asia-Pacific",
  SG: "Asia-Pacific", IN: "Asia-Pacific", ID: "Asia-Pacific", MY: "Asia-Pacific",
  TH: "Asia-Pacific", PH: "Asia-Pacific", VN: "Asia-Pacific", AU: "Asia-Pacific", NZ: "Asia-Pacific",
  SA: "Middle East & Africa", AE: "Middle East & Africa", QA: "Middle East & Africa",
  KW: "Middle East & Africa", BH: "Middle East & Africa", OM: "Middle East & Africa",
  IL: "Middle East & Africa", EG: "Middle East & Africa", ZA: "Middle East & Africa",
  MA: "Middle East & Africa", NG: "Middle East & Africa", KE: "Middle East & Africa",
  BR: "Latin America", AR: "Latin America", CL: "Latin America", CO: "Latin America", PE: "Latin America",
};

const COUNTRY_NAME: Record<string, string> = {
  US: "United States", CA: "Canada", MX: "Mexico", IT: "Italy", DE: "Germany", FR: "France",
  NL: "Netherlands", ES: "Spain", PT: "Portugal", BE: "Belgium", IE: "Ireland", AT: "Austria",
  CH: "Switzerland", GB: "United Kingdom", SE: "Sweden", NO: "Norway", DK: "Denmark",
  FI: "Finland", PL: "Poland", CZ: "Czechia", GR: "Greece", HU: "Hungary", TR: "Türkiye",
  JP: "Japan", CN: "China", HK: "Hong Kong", TW: "Taiwan", KR: "South Korea", SG: "Singapore",
  IN: "India", ID: "Indonesia", MY: "Malaysia", TH: "Thailand", PH: "Philippines", VN: "Vietnam",
  AU: "Australia", NZ: "New Zealand", SA: "Saudi Arabia", AE: "United Arab Emirates",
  QA: "Qatar", KW: "Kuwait", BH: "Bahrain", OM: "Oman", IL: "Israel", EG: "Egypt",
  ZA: "South Africa", MA: "Morocco", NG: "Nigeria", KE: "Kenya",
  BR: "Brazil", AR: "Argentina", CL: "Chile", CO: "Colombia", PE: "Peru",
};

/** Yahoo listing suffix → country of the listing venue. */
const SUFFIX_COUNTRY: Record<string, string> = {
  ".MI": "IT", ".TI": "IT", ".L": "GB", ".IL": "GB", ".DE": "DE", ".F": "DE", ".BE": "DE",
  ".SG": "DE", ".MU": "DE", ".HM": "DE", ".DU": "DE", ".PA": "FR", ".AS": "NL", ".BR": "BE",
  ".LS": "PT", ".MC": "ES", ".SW": "CH", ".VX": "CH", ".VI": "AT", ".ST": "SE", ".OL": "NO",
  ".CO": "DK", ".HE": "FI", ".IC": "IS", ".IR": "IE", ".AT": "GR", ".WA": "PL", ".PR": "CZ",
  ".BD": "HU", ".IS": "TR", ".ME": "RU",
  ".TO": "CA", ".V": "CA", ".NE": "CA", ".CN": "CA", ".MX": "MX",
  ".SA": "BR", ".BA": "AR", ".SN": "CL", ".CL": "CO", ".LM": "PE",
  ".T": "JP", ".JP": "JP", ".SS": "CN", ".SZ": "CN", ".HK": "HK", ".TW": "TW", ".TWO": "TW",
  ".KS": "KR", ".KQ": "KR", ".SI": "SG", ".NS": "IN", ".BO": "IN", ".JK": "ID", ".KL": "MY",
  ".BK": "TH", ".PS": "PH", ".VN": "VN", ".AX": "AU", ".NZ": "NZ",
  ".SR": "SA", ".AD": "AE", ".DU": "AE", ".DFM": "AE", ".QA": "QA", ".KW": "KW",
  ".BH": "BH", ".OM": "OM", ".TA": "IL", ".CA": "EG", ".JO": "ZA", ".MA": "MA",
  ".LG": "NG", ".NR": "KE",
};

export function geoFromCode(code?: string | null): GeoInfo | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  if (!COUNTRY_NAME[c]) return null;
  return { code: c, country: COUNTRY_NAME[c], region: REGION_BY_CODE[c] ?? "Other" };
}

/** Resolve a full country name (e.g. Yahoo's assetProfile.country) to GeoInfo. */
export function geoFromCountryName(name?: string | null): GeoInfo | null {
  if (!name) return null;
  const target = name.trim().toLowerCase();
  const alias: Record<string, string> = {
    "united states": "US", usa: "US", "u.s.": "US", "united kingdom": "GB", uk: "GB",
    "hong kong": "HK", "south korea": "KR", "korea": "KR", "republic of korea": "KR",
    "taiwan": "TW", "russia": "RU", "turkey": "TR", "czech republic": "CZ", "uae": "AE",
    "united arab emirates": "AE", "netherlands": "NL",
  };
  if (alias[target]) return geoFromCode(alias[target]);
  const hit = Object.entries(COUNTRY_NAME).find(([, n]) => n.toLowerCase() === target);
  return hit ? geoFromCode(hit[0]) : null;
}

/** Country of the listing venue, derived from the Yahoo symbol suffix. */
export function geoFromSymbol(symbol?: string | null): GeoInfo | null {
  if (!symbol) return null;
  const s = symbol.trim().toUpperCase();
  const dot = s.lastIndexOf(".");
  if (dot < 0) return geoFromCode("US"); // no suffix = US listing
  const suffix = s.slice(dot);
  const code = SUFFIX_COUNTRY[suffix];
  return code ? geoFromCode(code) : null;
}

/**
 * Best-effort region for a fund/ETF, read from its name and Morningstar
 * category. Funds rarely publish a machine-readable country table, so this is
 * clearly presented in the UI as an estimate.
 */
export function regionFromFundText(...parts: (string | null | undefined)[]): string | null {
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  if (!text) return null;
  const rules: Array<[RegExp, string]> = [
    [/\b(all[- ]?world|global|world|msci acwi|acwi|developed markets|international)\b/, "Global"],
    [/\b(emerging|em markets|frontier)\b/, "Emerging markets"],
    [/\b(s&p ?500|nasdaq|usa|u\.s\.|us equity|america|american)\b/, "North America"],
    [/\b(europe|euro stoxx|eurozone|stoxx|emu)\b/, "Europe"],
    [/\b(italia|italy|ftse mib)\b/, "Italy"],
    [/\b(uk|united kingdom|ftse 100)\b/, "United Kingdom"],
    [/\b(china|chinese|csi|hang seng)\b/, "China"],
    [/\b(japan|topix|nikkei)\b/, "Asia-Pacific"],
    [/\b(asia|pacific|india|korea|taiwan|asean)\b/, "Asia-Pacific"],
    [/\b(latin|brazil|mexico|latam)\b/, "Latin America"],
    [/\b(africa|middle east|gcc|saudi|gulf)\b/, "Middle East & Africa"],
  ];
  for (const [re, region] of rules) if (re.test(text)) return region;
  return null;
}

/** Aggregate weights into a sorted [label, weight] list. */
export function aggregate(entries: Array<[string, number]>): Array<[string, number]> {
  const map: Record<string, number> = {};
  for (const [k, v] of entries) {
    if (!isFinite(v) || v <= 0) continue;
    map[k] = (map[k] ?? 0) + v;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}
