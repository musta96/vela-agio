/**
 * Curated peer universe for ETFs and funds.
 *
 * Peers are grouped by what the vehicle actually holds (underlying exposure),
 * not by issuer, so a UCITS world tracker can be compared side by side with a
 * US-listed equivalent. Matching runs on the Yahoo category, the fund name and
 * the published objective.
 */

export interface PeerGroup {
  key: string;
  label: string;
  /** Lower-cased keywords; any hit contributes to the match score. */
  keywords: string[];
  /** Representative, liquid vehicles with the same underlying exposure. */
  symbols: string[];
}

export const PEER_GROUPS: PeerGroup[] = [
  {
    key: "global-equity",
    label: "Global developed equity",
    keywords: ["global large", "world", "msci world", "global equity", "globale", "acwi", "all country", "developed markets"],
    symbols: ["SWDA.MI", "EUNL.DE", "VWCE.DE", "IWDA.AS", "VWRL.AS", "URTH", "ACWI"],
  },
  {
    key: "us-large",
    label: "US large cap",
    keywords: ["large blend", "s&p 500", "sp 500", "u.s. large", "us large", "usa large", "north america"],
    symbols: ["CSPX.MI", "SXR8.DE", "VUSA.AS", "SPY", "VOO", "IVV"],
  },
  {
    key: "nasdaq-tech",
    label: "US technology / Nasdaq",
    keywords: ["technology", "nasdaq", "tecnologia", "information technology", "software"],
    symbols: ["EQQQ.MI", "CNDX.MI", "QQQ", "XLK", "VGT"],
  },
  {
    key: "semiconductors",
    label: "Semiconductors",
    keywords: ["semiconductor", "semiconduttori", "chip"],
    symbols: ["CHIP.MI", "SMH", "SOXX"],
  },
  {
    key: "europe-equity",
    label: "European equity",
    keywords: ["europe", "eurozone", "euro stoxx", "europa", "stoxx 600"],
    symbols: ["MEUD.PA", "EXSA.DE", "IMEU.AS", "VGK"],
  },
  {
    key: "italy-equity",
    label: "Italian equity",
    keywords: ["italy", "italia", "ftse mib"],
    symbols: ["ETFMIB.MI", "EWI"],
  },
  {
    key: "emerging",
    label: "Emerging markets equity",
    keywords: ["emerging", "emergenti", "em equity"],
    symbols: ["EIMI.MI", "EMIM.AS", "IEMG", "VWO"],
  },
  {
    key: "china",
    label: "China equity",
    keywords: ["china", "cina", "greater china", "hong kong"],
    symbols: ["MCHI", "FXI", "KWEB"],
  },
  {
    key: "japan",
    label: "Japan equity",
    keywords: ["japan", "giappone", "topix", "nikkei"],
    symbols: ["EWJ", "IJPA.AS", "SJPA.L"],
  },
  {
    key: "small-cap",
    label: "Small cap equity",
    keywords: ["small cap", "small-cap", "russell 2000", "piccole"],
    symbols: ["IWM", "ZPRS.DE", "WSML.L"],
  },
  {
    key: "dividend",
    label: "Dividend / income equity",
    keywords: ["dividend", "dividendo", "high yield equity", "income equity", "quality income"],
    symbols: ["SCHD", "VYM", "IUKD.L", "TDIV.AS"],
  },
  {
    key: "healthcare",
    label: "Healthcare",
    keywords: ["health", "salute", "biotech", "pharma", "medical"],
    symbols: ["XLV", "IHI", "IHCU.L"],
  },
  {
    key: "water",
    label: "Water & infrastructure",
    keywords: ["water", "acqua", "infrastructure", "utilities"],
    symbols: ["IH2O.MI", "CGW", "PHO", "XLU"],
  },
  {
    key: "clean-energy",
    label: "Clean energy & transition",
    keywords: ["clean energy", "renewable", "solar", "energia pulita", "transition"],
    symbols: ["ICLN", "INRG.L", "TAN"],
  },
  {
    key: "robotics-ai",
    label: "Robotics, automation & AI",
    keywords: ["robotic", "automation", "artificial intelligence", "robotica", "innovation", "megatrend"],
    symbols: ["RBOT.MI", "BOTZ", "ROBO", "ARKK"],
  },
  {
    key: "gold",
    label: "Gold & precious metals",
    keywords: ["gold", "oro", "precious metals", "silver", "argento", "bullion"],
    symbols: ["SGLD.MI", "PHAU.MI", "IGLN.L", "GLD", "IAU"],
  },
  {
    key: "commodities",
    label: "Broad commodities",
    keywords: ["commodit", "materie prime", "broad basket", "energy futures"],
    symbols: ["DBC", "PDBC", "CMOD.L"],
  },
  {
    key: "govt-bonds",
    label: "Government bonds",
    keywords: ["government", "treasury", "govt", "titoli di stato", "sovereign", "gilt", "bund"],
    symbols: ["IEF", "TLT", "IBTM.AS", "IBGL.AS", "SEGA.L"],
  },
  {
    key: "corporate-bonds",
    label: "Corporate credit",
    keywords: ["corporate bond", "credit", "investment grade", "high yield bond", "obbligazion"],
    symbols: ["LQD", "IEAC.AS", "HYG", "IHYG.L"],
  },
  {
    key: "aggregate-bonds",
    label: "Aggregate / multi-sector bonds",
    keywords: ["aggregate", "multisector", "global bond", "intermediate core", "bond market"],
    symbols: ["AGG", "BND", "AGGH.MI", "AGGG.L"],
  },
  {
    key: "money-market",
    label: "Cash & money market",
    keywords: ["money market", "ultrashort", "liquidity", "monetario", "t-bill"],
    symbols: ["BIL", "SHV", "XEON.DE", "ERNE.L"],
  },
];

export interface PeerMatch {
  group: PeerGroup | null;
  symbols: string[];
}

/**
 * Picks the peer group that best describes a vehicle and returns up to
 * `limit` comparable symbols, excluding the vehicle itself.
 */
export function findPeers(
  input: { symbol: string; category?: string | null; name?: string | null; description?: string | null },
  limit = 6,
): PeerMatch {
  const hay = [input.category, input.name, input.description].filter(Boolean).join(" ").toLowerCase();
  const self = input.symbol.toUpperCase();
  const selfRoot = self.split(".")[0];

  let best: PeerGroup | null = null;
  let bestScore = 0;
  for (const g of PEER_GROUPS) {
    let score = 0;
    for (const k of g.keywords) if (hay.includes(k)) score += k.length;
    // A vehicle that is itself in the group is a strong signal.
    if (g.symbols.some((s) => s.toUpperCase() === self || s.split(".")[0] === selfRoot)) score += 40;
    if (score > bestScore) { bestScore = score; best = g; }
  }

  if (!best || bestScore === 0) return { group: null, symbols: [] };
  const symbols = best.symbols
    .filter((s) => s.toUpperCase() !== self && s.split(".")[0] !== selfRoot)
    .slice(0, limit);
  return { group: best, symbols };
}
