import { THEMATIC_BASKETS } from "./thematicBaskets";
import { INDICES } from "./marketTaxonomy";

/**
 * Trading 212–style curated rails surfaced on the Explore page.
 * Three "kinds" of rails:
 *  - "symbols"  → static curated symbol list (quotes fetched in batch).
 *  - "screener" → Yahoo predefined screener via the `market-movers` edge function.
 *  - "internal" → derived from our own aggregations (Most owned/bought/sold).
 */

export type RailKind = "symbols" | "screener" | "internal";

export interface CuratedRail {
  id: string;
  label: string;
  emoji: string;
  kind: RailKind;
  /** For "symbols" rails. */
  symbols?: string[];
  /** For "screener" rails — Yahoo screener id + region. */
  screener?: string;
  region?: string;
  /** For "internal" rails — which metric. */
  metric?: "most_owned" | "most_bought" | "most_sold";
  /** Auth requirement. */
  requiresAuth?: boolean;
}

export interface RailGroup {
  id: string;
  rails: CuratedRail[];
}

/** Symbols shown in the top "spotlight" strip. */
export const SPOTLIGHT_SYMBOLS: { symbol: string; label: string; emoji: string }[] = [
  { symbol: "CL=F", label: "Crude Oil", emoji: "🛢️" },
  { symbol: "GC=F", label: "Gold", emoji: "🥇" },
  { symbol: "BTC-USD", label: "Bitcoin", emoji: "₿" },
  { symbol: "ES=F", label: "S&P 500", emoji: "📈" },
  { symbol: "^VIX", label: "VIX", emoji: "🌡️" },
  { symbol: "EURUSD=X", label: "EUR/USD", emoji: "💶" },
];

const basket = (id: string) => THEMATIC_BASKETS.find((b) => b.id === id)?.symbols ?? [];

/** Ordered groups of 3 tabs each — matches the Trading 212 layout. */
export const RAIL_GROUPS: RailGroup[] = [
  {
    id: "popular",
    rails: [
      { id: "most_owned",  label: "Most owned",  emoji: "❤️", kind: "internal", metric: "most_owned",  requiresAuth: true },
      { id: "most_bought", label: "Most bought", emoji: "🛍️", kind: "internal", metric: "most_bought", requiresAuth: true },
      { id: "most_sold",   label: "Most sold",   emoji: "💔", kind: "internal", metric: "most_sold",   requiresAuth: true },
    ],
  },
  {
    id: "themes-tech",
    rails: [
      { id: "big-tech", label: "Big tech",  emoji: "👩‍💻", kind: "symbols",
        symbols: ["AAPL","MSFT","NVDA","AMZN","META","GOOGL","TSLA","AVGO","ORCL","AMD"] },
      { id: "eu-defense", label: "EU defence", emoji: "🛡️", kind: "symbols", symbols: basket("eu-defense") },
      { id: "quantum",    label: "Quantum",    emoji: "⚛️", kind: "symbols", symbols: basket("quantum-computing") },
    ],
  },
  {
    id: "movers",
    rails: [
      { id: "top_gainers", label: "Top movers ↑", emoji: "🚀", kind: "screener", screener: "day_gainers", region: "us" },
      { id: "top_losers",  label: "Top movers ↓", emoji: "📉", kind: "screener", screener: "day_losers",  region: "us" },
      { id: "most_actives", label: "Most traded", emoji: "🔥", kind: "screener", screener: "most_actives", region: "us" },
    ],
  },
  {
    id: "themes-yield",
    rails: [
      { id: "italian-banks", label: "Italian banks",  emoji: "🏦", kind: "symbols", symbols: basket("italian-banks") },
      { id: "high-yield",    label: "High dividend",  emoji: "💵", kind: "screener", screener: "high_yield_dividend", region: "us" },
      { id: "reits",         label: "REIT",           emoji: "🏘️", kind: "symbols", symbols: basket("reits") },
    ],
  },
  {
    id: "themes-cycle",
    rails: [
      { id: "energy",        label: "Energy transition", emoji: "⚡", kind: "symbols", symbols: basket("energy-transition") },
      { id: "luxury",        label: "Luxury",            emoji: "👜", kind: "symbols", symbols: basket("luxury-europe") },
      { id: "automotive",    label: "Automotive",        emoji: "🚗", kind: "symbols", symbols: basket("automotive") },
    ],
  },
  {
    id: "themes-health",
    rails: [
      { id: "big-pharma", label: "Big pharma", emoji: "💊", kind: "symbols", symbols: basket("big-pharma") },
      { id: "glp1",       label: "GLP-1",      emoji: "🧬", kind: "symbols", symbols: basket("glp1-pharma") },
      { id: "sinful",     label: "Sinful",     emoji: "😈", kind: "symbols", symbols: basket("sinful-stocks") },
    ],
  },
  {
    id: "regions",
    rails: [
      { id: "us-greats", label: "US greats",      emoji: "🇺🇸", kind: "symbols",
        symbols: INDICES.sp500.constituents.slice(0, 12) },
      { id: "uk-biggest", label: "UK's biggest",  emoji: "🇬🇧", kind: "symbols",
        symbols: INDICES.ftse100.constituents.slice(0, 12) },
      { id: "eu-giants",  label: "European giants", emoji: "🇪🇺", kind: "symbols",
        symbols: INDICES.stoxx50.constituents.slice(0, 12) },
    ],
  },
  {
    id: "asia",
    rails: [
      { id: "nikkei",  label: "Nikkei 225", emoji: "🇯🇵", kind: "symbols", symbols: INDICES.nikkei.constituents.slice(0, 12) },
      { id: "hk",      label: "Hang Seng",  emoji: "🇭🇰", kind: "symbols", symbols: INDICES.hangseng.constituents.slice(0, 12) },
      { id: "ftsemib", label: "FTSE MIB",   emoji: "🇮🇹", kind: "symbols", symbols: INDICES.ftse_mib.constituents.slice(0, 12) },
    ],
  },
  {
    id: "alt",
    rails: [
      { id: "crypto",     label: "Crypto top 10", emoji: "₿",  kind: "symbols", symbols: basket("crypto-top") },
      { id: "fx",         label: "Forex majors",  emoji: "💱", kind: "symbols", symbols: basket("fx-majors") },
      { id: "commodities", label: "Commodities",  emoji: "🛢️", kind: "symbols", symbols: basket("commodities") },
    ],
  },
  {
    id: "macro",
    rails: [
      { id: "bonds",   label: "Government bonds", emoji: "📜", kind: "symbols", symbols: basket("govt-bonds") },
      { id: "futures", label: "US index futures", emoji: "📊", kind: "symbols", symbols: basket("us-index-futures") },
      { id: "shorted", label: "Most shorted",     emoji: "🩳", kind: "screener", screener: "most_shorted_stocks", region: "us" },
    ],
  },
  {
    id: "more",
    rails: [
      { id: "small-cap-gainers", label: "Small-cap gainers", emoji: "🌱", kind: "screener", screener: "small_cap_gainers", region: "us" },
      { id: "growth-tech",       label: "Growth tech",       emoji: "🚀", kind: "screener", screener: "growth_technology_stocks", region: "us" },
      { id: "undervalued",       label: "Undervalued",       emoji: "🪙", kind: "screener", screener: "undervalued_large_caps", region: "us" },
    ],
  },
];

/** Chip-grid "More lists" entries — link to dedicated theme pages or filtered search. */
export const MORE_LISTS: { id: string; label: string; emoji: string; symbols: string[] }[] = [
  { id: "airlines",   label: "Airlines",          emoji: "✈️", symbols: basket("airlines") },
  { id: "insurance",  label: "Insurance giants",  emoji: "💼", symbols: basket("insurance-giants") },
  { id: "ai",         label: "AI megatrend",      emoji: "🤖", symbols: basket("ai-megatrend") },
  { id: "us-mega",    label: "US megacap",        emoji: "🏛️", symbols: basket("us-megacap") },
  { id: "mib-core",   label: "FTSE MIB core",     emoji: "🇮🇹", symbols: basket("ftse-mib-core") },
];