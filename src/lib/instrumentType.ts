// Shared normalisation of instrument types coming from Yahoo, our catalogue
// and stored watchlist rows, so every surface labels an instrument the same way.

export type InstrumentKind =
  | "equity" | "etf" | "fund" | "crypto" | "fx" | "index" | "bond" | "future" | "other";

const MAP: Record<string, InstrumentKind> = {
  EQUITY: "equity", COMPANY: "equity", STOCK: "equity", EQUITIES: "equity",
  ETF: "etf", ETC: "etf", ETN: "etf",
  MUTUALFUND: "fund", FUND: "fund", MUTUAL_FUND: "fund", OEIC: "fund", SICAV: "fund",
  CRYPTOCURRENCY: "crypto", CRYPTO: "crypto",
  CURRENCY: "fx", FX: "fx", FOREX: "fx",
  INDEX: "index", INDICES: "index",
  BOND: "bond", FIXEDINCOME: "bond",
  FUTURE: "future", FUTURES: "future",
};

/** Best-effort classification from a raw type string plus symbol/name hints. */
export function classifyInstrument(raw?: string | null, symbol?: string, name?: string): InstrumentKind {
  const t = (raw ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (MAP[t]) return MAP[t];

  const sym = (symbol ?? "").toUpperCase();
  const nm = (name ?? "").toLowerCase();
  if (/-USD$|-EUR$|-GBP$/.test(sym) && !sym.includes("=")) return "crypto";
  if (/=X$/.test(sym)) return "fx";
  if (/=F$/.test(sym)) return "future";
  if (/^\^/.test(sym)) return "index";
  if (/\betf\b|ucits etf|ishares|xtrackers|amundi etf|lyxor|invesco .*etf|vanguard .*etf|spdr/.test(nm)) return "etf";
  if (/\bfund\b|sicav|fondo|oeic|\bacc\b|\bdist\b|\bfcp\b/.test(nm)) return "fund";
  if (/\bbond\b|treasury|btp|bund|gilt/.test(nm)) return "bond";
  return raw ? "other" : "equity";
}

export const INSTRUMENT_LABEL: Record<InstrumentKind, string> = {
  equity: "Stock", etf: "ETF", fund: "Fund", crypto: "Crypto", fx: "Forex",
  index: "Index", bond: "Bond", future: "Future", other: "Other",
};

/** Semantic-token badge classes (no hardcoded colours outside the palette). */
export const INSTRUMENT_BADGE: Record<InstrumentKind, string> = {
  equity: "bg-primary/10 text-primary",
  etf: "bg-chart-2/15 text-chart-2",
  fund: "bg-chart-3/15 text-chart-3",
  crypto: "bg-chart-4/15 text-chart-4",
  fx: "bg-chart-5/15 text-chart-5",
  index: "bg-muted text-muted-foreground",
  bond: "bg-chart-1/15 text-chart-1",
  future: "bg-muted text-muted-foreground",
  other: "bg-muted text-muted-foreground",
};

/** Funds and ETFs have their own detail page. */
export function detailPathFor(kind: InstrumentKind, symbol: string): string {
  return kind === "etf" || kind === "fund"
    ? `/fund/${encodeURIComponent(symbol)}`
    : `/stock/${encodeURIComponent(symbol)}`;
}

export function instrumentLabel(raw?: string | null, symbol?: string, name?: string): string {
  return INSTRUMENT_LABEL[classifyInstrument(raw, symbol, name)];
}
