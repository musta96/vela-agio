// Stooq quote fallback. Free CSV endpoint, no auth, no rate-limit headers.
// Used when Yahoo Finance returns 401/403/429/5xx so the app keeps working
// without a Yahoo session cookie.

function yahooToStooq(symbol: string): string | null {
  const s = symbol.trim();
  if (!s) return null;

  // Crypto: BTC-USD → btcusd
  const crypto = s.match(/^([A-Z0-9]{2,6})-(USD|EUR|USDT|USDC)$/i);
  if (crypto) return `${crypto[1].toLowerCase()}${crypto[2].toLowerCase()}`;

  // FX: EURUSD=X → eurusd
  const fx = s.match(/^([A-Z]{6})=X$/i);
  if (fx) return fx[1].toLowerCase();

  // Indices: ^GSPC → ^spx, ^DJI → ^dji, ^IXIC → ^ndq, ^NDX → ^ndx,
  // ^FTSE → ^ftm, ^GDAXI → ^dax, ^N225 → ^nkx, ^VIX → ^vix
  if (s.startsWith("^")) {
    const map: Record<string, string> = {
      "^GSPC": "^spx", "^DJI": "^dji", "^IXIC": "^ndq", "^NDX": "^ndx",
      "^RUT": "^rut", "^FTSE": "^ftm", "^GDAXI": "^dax", "^FCHI": "^cac",
      "^N225": "^nkx", "^HSI": "^hsi", "^VIX": "^vix",
      "^STOXX50E": "^stx50", "^TNX": "10usy.b",
    };
    return map[s.toUpperCase()] ?? null;
  }

  // Futures (=F) and bond yields (=RR) not supported on Stooq's free feed.
  if (s.includes("=")) return null;

  // International equities by Yahoo suffix → Stooq country suffix.
  const suffixMap: Record<string, string> = {
    "MI": "it", "DE": "de", "F": "de", "AS": "nl", "PA": "fr", "BR": "be",
    "LS": "pt", "IR": "ie", "L": "uk", "MC": "es", "SW": "ch", "ST": "se",
    "HE": "fi", "CO": "dk", "OL": "no", "VI": "at", "WA": "pl",
    "TO": "ca", "V": "ca", "T": "jp", "HK": "hk", "AX": "au",
  };
  const parts = s.split(".");
  if (parts.length === 2 && suffixMap[parts[1].toUpperCase()]) {
    return `${parts[0].toLowerCase()}.${suffixMap[parts[1].toUpperCase()]}`;
  }

  // Default: US listing.
  if (/^[A-Z][A-Z0-9.\-]{0,9}$/.test(s)) return `${s.toLowerCase()}.us`;

  return null;
}

export type StooqQuote = {
  symbol: string;
  price: number;
  previousClose: number;
  change: number;
  currency?: string;
  updatedAt: number;
  asOf: number;
  source: "stooq";
};

/** Best-effort quote lookup via Stooq. Returns null on any failure. */
export async function fetchStooqQuote(symbol: string): Promise<StooqQuote | null> {
  const stooqSym = yahooToStooq(symbol);
  if (!stooqSym) return null;
  try {
    const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSym)}&f=sd2t2ohlcvn&h&e=csv`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const csv = (await res.text()).trim();
    const lines = csv.split(/\r?\n/);
    if (lines.length < 2) return null;
    const cols = lines[1].split(",");
    // header: Symbol,Date,Time,Open,High,Low,Close,Volume,Name
    const close = Number(cols[6]);
    const open = Number(cols[3]);
    if (!Number.isFinite(close) || close <= 0) return null;
    const prev = Number.isFinite(open) && open > 0 ? open : close;
    const dateStr = `${cols[1]}T${cols[2] || "00:00:00"}Z`;
    const asOf = Date.parse(dateStr);
    return {
      symbol,
      price: close,
      previousClose: prev,
      change: prev ? ((close - prev) / prev) * 100 : 0,
      updatedAt: Date.now(),
      asOf: Number.isFinite(asOf) ? asOf : Date.now(),
      source: "stooq",
    };
  } catch {
    return null;
  }
}