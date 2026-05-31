/**
 * Shared market taxonomy. Single source of truth for asset classes, regions,
 * indices (with real constituent samples), sectors and styles. Consumed by
 * the Explore, Movers and (later) Screener pages so filters stay consistent
 * across the platform.
 */

export type AssetClass =
  | "equity" | "etf" | "mutual_fund" | "bond" | "crypto" | "fx" | "future" | "index";

export const ASSET_CLASSES: { key: AssetClass; label: string; yahooTypes: string[] }[] = [
  { key: "equity",       label: "Stocks",       yahooTypes: ["EQUITY"] },
  { key: "etf",          label: "ETFs",         yahooTypes: ["ETF"] },
  { key: "mutual_fund",  label: "Mutual Funds", yahooTypes: ["MUTUALFUND"] },
  { key: "bond",         label: "Bonds",        yahooTypes: ["BOND"] },
  { key: "crypto",       label: "Crypto",       yahooTypes: ["CRYPTOCURRENCY"] },
  { key: "fx",           label: "FX",           yahooTypes: ["CURRENCY"] },
  { key: "future",       label: "Futures",      yahooTypes: ["FUTURE"] },
  { key: "index",        label: "Indices",      yahooTypes: ["INDEX"] },
];

export type RegionKey = "europe" | "italy" | "us" | "uk" | "asia" | "emerging" | "global";
export const REGIONS: { key: RegionKey; label: string; exchangeSuffixes: string[] }[] = [
  { key: "italy",    label: "Italy",          exchangeSuffixes: [".MI"] },
  { key: "europe",   label: "Europe",         exchangeSuffixes: [".MI", ".DE", ".PA", ".AS", ".BR", ".MC", ".LS", ".VI", ".HE", ".F", ".SW"] },
  { key: "uk",       label: "United Kingdom", exchangeSuffixes: [".L", ".IL"] },
  { key: "us",       label: "United States",  exchangeSuffixes: [""] },
  { key: "asia",     label: "Asia / Pacific", exchangeSuffixes: [".HK", ".T", ".SS", ".SZ", ".KS", ".KQ", ".TW", ".AX", ".NZ", ".SI"] },
  { key: "emerging", label: "Emerging",       exchangeSuffixes: [".NS", ".BO", ".SA", ".MX", ".JK", ".IS"] },
  { key: "global",   label: "Global",         exchangeSuffixes: [] },
];

/**
 * Major indices with a curated constituent list (top names). Used to scope
 * the Movers page. For a full constituent universe, fetch on demand.
 */
export type IndexKey =
  | "ftse_mib" | "sp500" | "nasdaq100" | "dow" | "stoxx50" | "dax" | "cac40" | "ftse100" | "nikkei" | "hangseng";

export const INDICES: Record<IndexKey, { label: string; symbol: string; region: RegionKey; constituents: string[] }> = {
  ftse_mib:   { label: "FTSE MIB",       symbol: "FTSEMIB.MI", region: "italy",
    constituents: ["ISP.MI","UCG.MI","ENI.MI","ENEL.MI","STLAM.MI","RACE.MI","TIT.MI","G.MI","STM.MI","UBI.MI","CPR.MI","MB.MI","FBK.MI","BAMI.MI","TRN.MI","SRG.MI","MONC.MI","REC.MI","CNHI.MI","LDO.MI","IG.MI","PIRC.MI","ATL.MI","HER.MI","DIA.MI"] },
  sp500:      { label: "S&P 500",        symbol: "^GSPC",      region: "us",
    constituents: ["AAPL","MSFT","NVDA","AMZN","META","GOOGL","BRK-B","TSLA","JPM","V","UNH","XOM","JNJ","WMT","PG","MA","HD","CVX","ABBV","KO","PEP","MRK","COST","AVGO","BAC","ORCL","ADBE","CRM","NFLX","TMO"] },
  nasdaq100:  { label: "Nasdaq 100",     symbol: "^NDX",       region: "us",
    constituents: ["AAPL","MSFT","NVDA","AMZN","META","GOOGL","TSLA","AVGO","COST","NFLX","ADBE","PEP","CSCO","AMD","TMUS","INTC","CMCSA","INTU","QCOM","TXN","ISRG","HON","BKNG","AMAT","SBUX","LRCX","MDLZ","ADP","GILD","REGN"] },
  dow:        { label: "Dow Jones",      symbol: "^DJI",       region: "us",
    constituents: ["AAPL","MSFT","UNH","GS","HD","CAT","CRM","AMGN","V","MCD","BA","HON","JPM","TRV","IBM","CVX","AXP","JNJ","PG","MMM","WMT","NKE","DIS","DOW","MRK","INTC","KO","CSCO","VZ","WBA"] },
  stoxx50:    { label: "Euro Stoxx 50",  symbol: "^STOXX50E",  region: "europe",
    constituents: ["ASML.AS","LVMH.PA","SAP.DE","SIE.DE","TTE.PA","SAN.PA","OR.PA","NOVN.SW","ALV.DE","DTE.DE","AI.PA","BNP.PA","ENEL.MI","SU.PA","BAYN.DE","BMW.DE","RMS.PA","ABI.BR","INGA.AS","ISP.MI"] },
  dax:        { label: "DAX 40",         symbol: "^GDAXI",     region: "europe",
    constituents: ["SAP.DE","SIE.DE","ALV.DE","DTE.DE","MUV2.DE","BAS.DE","BAYN.DE","ADS.DE","BMW.DE","VOW3.DE","MBG.DE","DBK.DE","DB1.DE","HEN3.DE","IFX.DE","RWE.DE","MRK.DE","DPW.DE","EOAN.DE","CON.DE"] },
  cac40:      { label: "CAC 40",         symbol: "^FCHI",      region: "europe",
    constituents: ["LVMH.PA","TTE.PA","SAN.PA","OR.PA","AI.PA","BNP.PA","SU.PA","RMS.PA","KER.PA","CS.PA","ACA.PA","DG.PA","ML.PA","GLE.PA","STLAP.PA","BN.PA","SAF.PA","CAP.PA","EN.PA","RNO.PA"] },
  ftse100:    { label: "FTSE 100",       symbol: "^FTSE",      region: "uk",
    constituents: ["AZN.L","SHEL.L","HSBA.L","ULVR.L","BP.L","RIO.L","GSK.L","DGE.L","REL.L","LSEG.L","NG.L","BATS.L","VOD.L","BARC.L","LLOY.L","NWG.L","TSCO.L","PRU.L","CRH.L","CPG.L"] },
  nikkei:     { label: "Nikkei 225",     symbol: "^N225",      region: "asia",
    constituents: ["7203.T","6758.T","9984.T","6861.T","8306.T","6098.T","9433.T","8035.T","6501.T","6902.T","6594.T","8316.T","4063.T","9432.T","4502.T","8001.T","8058.T","8031.T","6367.T","7974.T"] },
  hangseng:   { label: "Hang Seng",      symbol: "^HSI",       region: "asia",
    constituents: ["0700.HK","9988.HK","3690.HK","9618.HK","0941.HK","1299.HK","1398.HK","3988.HK","2318.HK","0939.HK","2628.HK","0005.HK","1810.HK","2382.HK","2020.HK","0883.HK","0388.HK","0386.HK","1024.HK","2331.HK"] },
};

/** Yahoo's predefined screener buckets we use to fetch movers globally. */
export const YAHOO_SCREENERS = {
  day_gainers:   "day_gainers",
  day_losers:    "day_losers",
  most_actives:  "most_actives",
} as const;
export type YahooScreenerKey = keyof typeof YAHOO_SCREENERS;