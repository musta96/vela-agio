// Curated regional market coverage for high-growth regions: MENA, APAC,
// China, Latin America and Africa. Instrument symbols use Yahoo Finance
// tickers so they work with the existing market-data pipeline. Macro
// snapshots are editorial reference points (reviewed periodically), not
// live feeds — live numbers come from the Macro page.

export interface RegionalInstrument {
  symbol: string;
  name: string;
  kind: "Index" | "ETF" | "Stock" | "FX" | "Future";
  note: string;
}

export interface RegionalMarket {
  id: string;
  name: string;
  blurb: string;
  exchanges: string;
  currencies: string[];
  marketHours: string;
  macroSnapshot: { label: string; value: string }[];
  structuralDrivers: string[];
  keyRisks: string[];
  instruments: RegionalInstrument[];
}

export const REGIONAL_MARKETS: RegionalMarket[] = [
  {
    id: "mena",
    name: "MENA",
    blurb: "Gulf markets driven by hydrocarbon fiscal surpluses, sovereign-wealth recycling and exchange reforms (Tadawul, ADX, DFM, QE).",
    exchanges: "Tadawul (Saudi), ADX, DFM, Qatar Exchange, Boursa Kuwait, EGX",
    currencies: ["SAR", "AED", "QAR", "KWD", "EGP"],
    marketHours: "Sun–Thu, roughly 10:00–15:00 local (Gulf); closed Fri–Sat.",
    macroSnapshot: [
      { label: "Growth driver", value: "Vision 2030 capex + non-oil diversification" },
      { label: "Policy anchor", value: "USD pegs (SAR/AED/QAR) → Fed pass-through" },
      { label: "Index inclusion", value: "MSCI EM (Saudi ~4% weight)" },
      { label: "Liquidity note", value: "Foreign-ownership limits easing; T+0 pilots on Tadawul" },
    ],
    structuralDrivers: ["Oil & gas fiscal breakevens", "Sovereign wealth (PIF, ADIA, QIA) deployment", "IPO pipeline & privatizations", "Tourism / giga-projects"],
    keyRisks: ["Oil price shocks", "Geopolitical escalation", "Peg pressure in stress", "Concentration in banks & energy"],
    instruments: [
      { symbol: "^TASI.SR", name: "Tadawul All Share", kind: "Index", note: "Saudi benchmark" },
      { symbol: "KSA", name: "iShares MSCI Saudi Arabia ETF", kind: "ETF", note: "US-listed proxy" },
      { symbol: "GULF", name: "WisdomTree Middle East Dividend", kind: "ETF", note: "Regional dividend tilt" },
      { symbol: "2222.SR", name: "Saudi Aramco", kind: "Stock", note: "Largest regional cap" },
      { symbol: "QAT", name: "iShares MSCI Qatar ETF", kind: "ETF", note: "Qatar proxy" },
      { symbol: "UAE", name: "iShares MSCI UAE ETF", kind: "ETF", note: "UAE proxy" },
    ],
  },
  {
    id: "apac",
    name: "APAC (ex-China)",
    blurb: "Japan governance reform, India domestic-demand compounding, and ASEAN supply-chain beneficiaries.",
    exchanges: "TSE, NSE/BSE, KRX, ASX, SGX, IDX, SET",
    currencies: ["JPY", "INR", "KRW", "AUD", "SGD", "IDR"],
    marketHours: "Mon–Fri; Tokyo 9:00–15:00, Mumbai 9:15–15:30, Sydney 10:00–16:00 local.",
    macroSnapshot: [
      { label: "Japan", value: "BOJ normalization + TSE corporate reform" },
      { label: "India", value: "~6-7% real GDP trend; capex & digital rails" },
      { label: "Korea/Taiwan", value: "Semiconductor cycle leverage" },
      { label: "ASEAN", value: "China+1 manufacturing FDI" },
    ],
    structuralDrivers: ["Semis & AI hardware chain", "India demographics & financialization", "Yen regime shifts", "Commodity exports (AUD/IDR)"],
    keyRisks: ["Yen carry unwind", "China demand spillovers", "Valuation extremes (India)", "USD strength vs EM Asia FX"],
    instruments: [
      { symbol: "^N225", name: "Nikkei 225", kind: "Index", note: "Japan benchmark" },
      { symbol: "^NSEI", name: "NIFTY 50", kind: "Index", note: "India benchmark" },
      { symbol: "EWJ", name: "iShares MSCI Japan ETF", kind: "ETF", note: "Japan proxy" },
      { symbol: "INDA", name: "iShares MSCI India ETF", kind: "ETF", note: "India proxy" },
      { symbol: "EWY", name: "iShares MSCI South Korea ETF", kind: "ETF", note: "Korea proxy" },
      { symbol: "EWS", name: "iShares MSCI Singapore ETF", kind: "ETF", note: "Singapore proxy" },
      { symbol: "^AXJO", name: "ASX 200", kind: "Index", note: "Australia benchmark" },
    ],
  },
  {
    id: "china",
    name: "China",
    blurb: "Onshore A-shares, Hong Kong listings and US ADRs — policy-cycle driven with deep sector dispersion.",
    exchanges: "SSE, SZSE, HKEX",
    currencies: ["CNY", "CNH", "HKD"],
    marketHours: "Mon–Fri; Shanghai 9:30–15:00 (lunch 11:30–13:00), Hong Kong 9:30–16:00 local.",
    macroSnapshot: [
      { label: "Policy cycle", value: "Targeted easing; property deleveraging managed" },
      { label: "Index inclusion", value: "MSCI EM ~25% weight (varies)" },
      { label: "Flows", value: "Stock Connect North/Southbound dominant" },
      { label: "ADR note", value: "HFCAA audit access normalized but fragile" },
    ],
    structuralDrivers: ["Tech self-sufficiency (semis, EV, batteries)", "Consumption rebalancing", "SOE dividend re-rating", "Green energy buildout"],
    keyRisks: ["Regulatory shifts", "Property credit tail", "US-China tension / tariffs", "CNY depreciation pressure"],
    instruments: [
      { symbol: "000001.SS", name: "Shanghai Composite", kind: "Index", note: "Onshore benchmark" },
      { symbol: "^HSI", name: "Hang Seng Index", kind: "Index", note: "HK benchmark" },
      { symbol: "MCHI", name: "iShares MSCI China ETF", kind: "ETF", note: "Broad China proxy" },
      { symbol: "KWEB", name: "KraneShares CSI China Internet", kind: "ETF", note: "Internet/platform tilt" },
      { symbol: "0700.HK", name: "Tencent", kind: "Stock", note: "Largest HK-listed tech" },
      { symbol: "BABA", name: "Alibaba (ADR)", kind: "Stock", note: "US-listed ADR" },
      { symbol: "CNY=X", name: "USD/CNY", kind: "FX", note: "Onshore yuan" },
    ],
  },
  {
    id: "latam",
    name: "Latin America",
    blurb: "Commodity-linked equity cycles, high real rates (Brazil, Mexico) and nearshoring tailwinds.",
    exchanges: "B3 (Brazil), BMV (Mexico), BCS (Chile), BVC (Colombia), BYMA (Argentina)",
    currencies: ["BRL", "MXN", "CLP", "COP", "ARS"],
    marketHours: "Mon–Fri; São Paulo 10:00–17:00, Mexico City 8:30–15:00 local.",
    macroSnapshot: [
      { label: "Brazil", value: "High Selic → attractive carry; fiscal watch" },
      { label: "Mexico", value: "Nearshoring FDI; USMCA review 2026" },
      { label: "Chile/Peru", value: "Copper & lithium leverage" },
      { label: "Argentina", value: "Reform-driven re-rating, high volatility" },
    ],
    structuralDrivers: ["Copper/lithium energy-transition demand", "Nearshoring to Mexico", "Agricultural exports (Brazil)", "Rate-cut cycles boosting domestic equities"],
    keyRisks: ["Commodity price reversals", "Political/populist shifts", "USD strength", "Fiscal slippage"],
    instruments: [
      { symbol: "^BVSP", name: "Bovespa", kind: "Index", note: "Brazil benchmark" },
      { symbol: "^MXX", name: "IPC Mexico", kind: "Index", note: "Mexico benchmark" },
      { symbol: "EWZ", name: "iShares MSCI Brazil ETF", kind: "ETF", note: "Brazil proxy" },
      { symbol: "EWW", name: "iShares MSCI Mexico ETF", kind: "ETF", note: "Mexico proxy" },
      { symbol: "ILF", name: "iShares Latin America 40", kind: "ETF", note: "Regional proxy" },
      { symbol: "VALE", name: "Vale (ADR)", kind: "Stock", note: "Iron ore bellwether" },
      { symbol: "PBR", name: "Petrobras (ADR)", kind: "Stock", note: "Energy + dividends" },
    ],
  },
  {
    id: "africa",
    name: "Africa",
    blurb: "Frontier-market growth with South Africa, Egypt, Nigeria and Kenya as the most accessible markets.",
    exchanges: "JSE, NGX (Nigeria), EGX (Egypt), NSE (Kenya), BRVM (WAEMU)",
    currencies: ["ZAR", "NGN", "EGP", "KES"],
    marketHours: "Mon–Fri; Johannesburg 9:00–17:00, Lagos 10:00–14:20, Cairo 10:00–14:30 local.",
    macroSnapshot: [
      { label: "South Africa", value: "Deep JSE liquidity; power/logistics reforms" },
      { label: "Nigeria", value: "FX unification & fuel-subsidy reform" },
      { label: "Egypt", value: "IMF program; EGP float cycles" },
      { label: "Kenya", value: "East-Africa fintech hub (mobile money)" },
    ],
    structuralDrivers: ["Demographics & urbanization", "Mobile-money / fintech penetration", "Critical minerals (PGMs, cobalt, manganese)", "Infrastructure & power investment"],
    keyRisks: ["FX convertibility & repatriation", "Thin liquidity outside JSE", "Debt distress cycles", "Political/security risk"],
    instruments: [
      { symbol: "EZA", name: "iShares MSCI South Africa ETF", kind: "ETF", note: "South Africa proxy" },
      { symbol: "AFK", name: "VanEck Africa ETF", kind: "ETF", note: "Pan-Africa proxy" },
      { symbol: "^JN0U.JO", name: "JSE All Share", kind: "Index", note: "SA benchmark" },
      { symbol: "NGE", name: "Global X Nigeria ETF", kind: "ETF", note: "Nigeria proxy (check availability)" },
      { symbol: "ZAR=X", name: "USD/ZAR", kind: "FX", note: "Rand — EM FX bellwether" },
      { symbol: "GOLD", name: "Barrick Gold", kind: "Stock", note: "Africa gold exposure (NYSE)" },
    ],
  },
];

export function getRegionalMarket(id: string): RegionalMarket | undefined {
  return REGIONAL_MARKETS.find((r) => r.id === id);
}
