/**
 * Lightweight instrument classifier used by the correlation engine and
 * investment-memo generator. Pure-frontend, zero-network: classifies any
 * ticker into { sector, geography, assetClass } using a small curated map
 * for common globals plus suffix/heuristic fallbacks for everything else.
 *
 * "Unclassified" is a first-class bucket so the breakdowns stay honest
 * when a user adds an exotic symbol we haven't tagged.
 */

export type AssetClass =
  | "Equity"
  | "ETF"
  | "Bond"
  | "Commodity"
  | "Crypto"
  | "FX"
  | "REIT"
  | "Unclassified";

export type InstrumentMeta = {
  symbol: string;
  sector: string;
  geography: string;
  assetClass: AssetClass;
};

// Curated catalog for the most common globals. Kept intentionally small —
// anything missing falls through to the heuristic resolver below.
const CATALOG: Record<string, Omit<InstrumentMeta, "symbol">> = {
  // US mega-caps
  AAPL: { sector: "Technology", geography: "US", assetClass: "Equity" },
  MSFT: { sector: "Technology", geography: "US", assetClass: "Equity" },
  GOOGL: { sector: "Communication", geography: "US", assetClass: "Equity" },
  GOOG: { sector: "Communication", geography: "US", assetClass: "Equity" },
  META: { sector: "Communication", geography: "US", assetClass: "Equity" },
  AMZN: { sector: "Consumer Discretionary", geography: "US", assetClass: "Equity" },
  TSLA: { sector: "Consumer Discretionary", geography: "US", assetClass: "Equity" },
  NVDA: { sector: "Technology", geography: "US", assetClass: "Equity" },
  AMD: { sector: "Technology", geography: "US", assetClass: "Equity" },
  JPM: { sector: "Financials", geography: "US", assetClass: "Equity" },
  BAC: { sector: "Financials", geography: "US", assetClass: "Equity" },
  XOM: { sector: "Energy", geography: "US", assetClass: "Equity" },
  CVX: { sector: "Energy", geography: "US", assetClass: "Equity" },
  JNJ: { sector: "Healthcare", geography: "US", assetClass: "Equity" },
  PFE: { sector: "Healthcare", geography: "US", assetClass: "Equity" },
  UNH: { sector: "Healthcare", geography: "US", assetClass: "Equity" },
  KO: { sector: "Consumer Staples", geography: "US", assetClass: "Equity" },
  PG: { sector: "Consumer Staples", geography: "US", assetClass: "Equity" },
  // Broad / regional ETFs
  SPY: { sector: "Broad Market", geography: "US", assetClass: "ETF" },
  VOO: { sector: "Broad Market", geography: "US", assetClass: "ETF" },
  QQQ: { sector: "Technology", geography: "US", assetClass: "ETF" },
  IWM: { sector: "Small Cap", geography: "US", assetClass: "ETF" },
  DIA: { sector: "Broad Market", geography: "US", assetClass: "ETF" },
  EFA: { sector: "Broad Market", geography: "Developed ex-US", assetClass: "ETF" },
  VEA: { sector: "Broad Market", geography: "Developed ex-US", assetClass: "ETF" },
  EEM: { sector: "Broad Market", geography: "Emerging Markets", assetClass: "ETF" },
  VWO: { sector: "Broad Market", geography: "Emerging Markets", assetClass: "ETF" },
  FXI: { sector: "Broad Market", geography: "China", assetClass: "ETF" },
  EWJ: { sector: "Broad Market", geography: "Japan", assetClass: "ETF" },
  EWG: { sector: "Broad Market", geography: "Germany", assetClass: "ETF" },
  EWU: { sector: "Broad Market", geography: "UK", assetClass: "ETF" },
  // Fixed income
  TLT: { sector: "Long Treasury", geography: "US", assetClass: "Bond" },
  IEF: { sector: "Treasury", geography: "US", assetClass: "Bond" },
  SHY: { sector: "Short Treasury", geography: "US", assetClass: "Bond" },
  LQD: { sector: "Investment Grade Credit", geography: "US", assetClass: "Bond" },
  HYG: { sector: "High Yield Credit", geography: "US", assetClass: "Bond" },
  AGG: { sector: "Aggregate", geography: "US", assetClass: "Bond" },
  BND: { sector: "Aggregate", geography: "US", assetClass: "Bond" },
  // Commodities
  GLD: { sector: "Precious Metals", geography: "Global", assetClass: "Commodity" },
  SLV: { sector: "Precious Metals", geography: "Global", assetClass: "Commodity" },
  USO: { sector: "Energy", geography: "Global", assetClass: "Commodity" },
  DBC: { sector: "Diversified", geography: "Global", assetClass: "Commodity" },
  // REITs
  VNQ: { sector: "Real Estate", geography: "US", assetClass: "REIT" },
  IYR: { sector: "Real Estate", geography: "US", assetClass: "REIT" },
};

// Yahoo-style exchange suffixes → geography. Covers the markets Vela serves.
const SUFFIX_GEO: Record<string, string> = {
  L: "UK", PA: "France", DE: "Germany", MI: "Italy", AS: "Netherlands",
  MC: "Spain", SW: "Switzerland", BR: "Belgium", LS: "Portugal", ST: "Sweden",
  CO: "Denmark", OL: "Norway", HE: "Finland", VI: "Austria", WA: "Poland",
  IR: "Ireland", AT: "Greece",
  T: "Japan", HK: "Hong Kong", SS: "China", SZ: "China",
  KS: "South Korea", KQ: "South Korea", TW: "Taiwan", TWO: "Taiwan",
  SI: "Singapore", BK: "Thailand", JK: "Indonesia", KL: "Malaysia",
  NS: "India", BO: "India", AX: "Australia", NZ: "New Zealand",
  TO: "Canada", V: "Canada", MX: "Mexico", SA: "Brazil", BA: "Argentina",
  JO: "South Africa", IS: "Turkey", TA: "Israel", SR: "Saudi Arabia", AE: "UAE",
};

/** Resolve metadata for any ticker — never throws, never returns null. */
export function getInstrumentMeta(symbol: string): InstrumentMeta {
  const raw = symbol.trim();
  const upper = raw.toUpperCase();

  // Crypto pairs: BTC-USD, ETH-USD, BTCUSDT, etc.
  if (/-USD$|USDT?$/.test(upper) && !/^[A-Z]{6}=X$/.test(upper)) {
    if (/^[A-Z0-9]{2,6}(-USD|USDT?)$/.test(upper)) {
      return { symbol: upper, sector: "Crypto", geography: "Global", assetClass: "Crypto" };
    }
  }

  // FX pairs (Yahoo format EURUSD=X)
  if (/=X$/.test(upper)) {
    return { symbol: upper, sector: "FX", geography: "Global", assetClass: "FX" };
  }

  // Curated catalog (US tickers and major ETFs are stored without suffix).
  if (CATALOG[upper]) return { symbol: upper, ...CATALOG[upper] };

  // Exchange-suffix heuristic for non-US listings.
  const dot = upper.lastIndexOf(".");
  if (dot > 0 && dot < upper.length - 1) {
    const suffix = upper.slice(dot + 1);
    const geo = SUFFIX_GEO[suffix];
    if (geo) {
      return { symbol: upper, sector: "Unclassified", geography: geo, assetClass: "Equity" };
    }
  }

  // Plain US-style ticker we don't have curated metadata for.
  if (/^[A-Z][A-Z0-9.]{0,5}$/.test(upper)) {
    return { symbol: upper, sector: "Unclassified", geography: "US", assetClass: "Equity" };
  }

  return { symbol: upper, sector: "Unclassified", geography: "Unknown", assetClass: "Unclassified" };
}

export function metaFor(symbols: string[]): InstrumentMeta[] {
  return symbols.map(getInstrumentMeta);
}