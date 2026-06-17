import { THEMATIC_BASKETS } from "./thematicBaskets";
import { INDICES } from "./marketTaxonomy";
import type { LucideIcon } from "lucide-react";
import {
  Flame, TrendingUp, TrendingDown, Activity, ShieldCheck, Atom, Cpu,
  Landmark, Coins, Building2, Zap, Gem, Car, Pill, Dna, Wine,
  Globe2, BarChart3, Bitcoin, Replace, Droplet, FileText, LineChart,
  Scissors, Sprout, Rocket, Sparkles, Plane, Briefcase, Bot, Castle, Heart,
  ShoppingBag, HeartCrack, MapPin
} from "lucide-react";

/**
 * Curated discovery rails surfaced on the Explore page.
 * Three "kinds" of rails:
 *  - "symbols"  → static curated symbol list (quotes fetched in batch).
 *  - "screener" → Yahoo predefined screener via the `market-movers` edge function.
 *  - "internal" → derived from our own aggregations (Most owned/bought/sold).
 */

export type RailKind = "symbols" | "screener" | "internal";

export interface CuratedRail {
  id: string;
  label: string;
  Icon: LucideIcon;
  kind: RailKind;
  /** For "symbols" rails. */
  symbols?: string[];
  /** For "screener" rails - Yahoo screener id + region. */
  screener?: string;
  region?: string;
  /** For "internal" rails - which metric. */
  metric?: "most_owned" | "most_bought" | "most_sold";
  /** Auth requirement. */
  requiresAuth?: boolean;
}

export interface RailGroup {
  id: string;
  eyebrow: string;
  title: string;
  rails: CuratedRail[];
}

/** Symbols shown in the top "spotlight" strip. */
export const SPOTLIGHT_SYMBOLS: { symbol: string; label: string; Icon: LucideIcon }[] = [
  { symbol: "CL=F",     label: "Crude Oil", Icon: Droplet },
  { symbol: "GC=F",     label: "Gold",      Icon: Gem },
  { symbol: "BTC-USD",  label: "Bitcoin",   Icon: Bitcoin },
  { symbol: "ES=F",     label: "S&P 500",   Icon: LineChart },
  { symbol: "^VIX",     label: "VIX",       Icon: Activity },
  { symbol: "EURUSD=X", label: "EUR/USD",   Icon: Replace },
];

const basket = (id: string) => THEMATIC_BASKETS.find((b) => b.id === id)?.symbols ?? [];

/** Ordered groups of 3 tabs each. */
export const RAIL_GROUPS: RailGroup[] = [
  {
    id: "popular", eyebrow: "On the platform", title: "What investors are doing",
    rails: [
      { id: "most_owned",  label: "Most owned",  Icon: Heart,        kind: "internal", metric: "most_owned",  requiresAuth: true },
      { id: "most_bought", label: "Most bought", Icon: ShoppingBag,  kind: "internal", metric: "most_bought", requiresAuth: true },
      { id: "most_sold",   label: "Most sold",   Icon: HeartCrack,   kind: "internal", metric: "most_sold",   requiresAuth: true },
    ],
  },
  {
    id: "themes-tech", eyebrow: "Themes", title: "Technology & innovation",
    rails: [
      { id: "big-tech",  label: "Big tech",  Icon: Cpu,  kind: "symbols",
        symbols: ["AAPL","MSFT","NVDA","AMZN","META","GOOGL","TSLA","AVGO","ORCL","AMD"] },
      { id: "eu-defense", label: "EU defence", Icon: ShieldCheck, kind: "symbols", symbols: basket("eu-defense") },
      { id: "quantum",    label: "Quantum",    Icon: Atom,        kind: "symbols", symbols: basket("quantum-computing") },
    ],
  },
  {
    id: "movers", eyebrow: "Today", title: "Market movers",
    rails: [
      { id: "top_gainers",  label: "Top gainers", Icon: TrendingUp,   kind: "screener", screener: "day_gainers",  region: "us" },
      { id: "top_losers",   label: "Top losers",  Icon: TrendingDown, kind: "screener", screener: "day_losers",   region: "us" },
      { id: "most_actives", label: "Most traded", Icon: Flame,        kind: "screener", screener: "most_actives", region: "us" },
    ],
  },
  {
    id: "themes-yield", eyebrow: "Income", title: "Yield & banks",
    rails: [
      { id: "italian-banks", label: "Italian banks", Icon: Landmark,  kind: "symbols",  symbols: basket("italian-banks") },
      { id: "high-yield",    label: "High dividend", Icon: Coins,     kind: "screener", screener: "high_yield_dividend", region: "us" },
      { id: "reits",         label: "REITs",         Icon: Building2, kind: "symbols",  symbols: basket("reits") },
    ],
  },
  {
    id: "themes-cycle", eyebrow: "Sectors", title: "Energy, luxury & autos",
    rails: [
      { id: "energy",     label: "Energy transition", Icon: Zap, kind: "symbols", symbols: basket("energy-transition") },
      { id: "luxury",     label: "Luxury",            Icon: Wine, kind: "symbols", symbols: basket("luxury-europe") },
      { id: "automotive", label: "Automotive",        Icon: Car,  kind: "symbols", symbols: basket("automotive") },
    ],
  },
  {
    id: "themes-health", eyebrow: "Sectors", title: "Healthcare",
    rails: [
      { id: "big-pharma", label: "Big pharma", Icon: Pill,     kind: "symbols", symbols: basket("big-pharma") },
      { id: "glp1",       label: "GLP-1",      Icon: Dna,      kind: "symbols", symbols: basket("glp1-pharma") },
      { id: "sinful",     label: "Sinful",     Icon: Scissors, kind: "symbols", symbols: basket("sinful-stocks") },
    ],
  },
  {
    id: "regions", eyebrow: "Geography", title: "Western markets",
    rails: [
      { id: "us-greats",  label: "US greats",       Icon: MapPin, kind: "symbols", symbols: INDICES.sp500.constituents.slice(0, 12) },
      { id: "uk-biggest", label: "UK's biggest",    Icon: MapPin, kind: "symbols", symbols: INDICES.ftse100.constituents.slice(0, 12) },
      { id: "eu-giants",  label: "European giants", Icon: MapPin, kind: "symbols", symbols: INDICES.stoxx50.constituents.slice(0, 12) },
    ],
  },
  {
    id: "asia", eyebrow: "Geography", title: "Asia-Pacific & Italy",
    rails: [
      { id: "nikkei",  label: "Nikkei 225", Icon: Globe2, kind: "symbols", symbols: INDICES.nikkei.constituents.slice(0, 12) },
      { id: "hk",      label: "Hang Seng",  Icon: Globe2, kind: "symbols", symbols: INDICES.hangseng.constituents.slice(0, 12) },
      { id: "ftsemib", label: "FTSE MIB",   Icon: Globe2, kind: "symbols", symbols: INDICES.ftse_mib.constituents.slice(0, 12) },
    ],
  },
  {
    id: "alt", eyebrow: "Beyond equities", title: "Crypto, FX & commodities",
    rails: [
      { id: "crypto",      label: "Crypto top 10", Icon: Bitcoin, kind: "symbols", symbols: basket("crypto-top") },
      { id: "fx",          label: "Forex majors",  Icon: Replace, kind: "symbols", symbols: basket("fx-majors") },
      { id: "commodities", label: "Commodities",   Icon: Droplet, kind: "symbols", symbols: basket("commodities") },
    ],
  },
  {
    id: "macro", eyebrow: "Macro", title: "Bonds, futures & shorts",
    rails: [
      { id: "bonds",   label: "Government bonds", Icon: FileText, kind: "symbols",  symbols: basket("govt-bonds") },
      { id: "futures", label: "US index futures", Icon: BarChart3, kind: "symbols", symbols: basket("us-index-futures") },
      { id: "shorted", label: "Most shorted",     Icon: TrendingDown, kind: "screener", screener: "most_shorted_stocks", region: "us" },
    ],
  },
  {
    id: "more", eyebrow: "Screeners", title: "Growth & value",
    rails: [
      { id: "small-cap-gainers", label: "Small-cap gainers", Icon: Sprout,   kind: "screener", screener: "small_cap_gainers",         region: "us" },
      { id: "growth-tech",       label: "Growth tech",       Icon: Rocket,   kind: "screener", screener: "growth_technology_stocks",  region: "us" },
      { id: "undervalued",       label: "Undervalued",       Icon: Sparkles, kind: "screener", screener: "undervalued_large_caps",    region: "us" },
    ],
  },
];

/** Chip-grid "More lists" entries - link to dedicated theme pages or filtered search. */
export const MORE_LISTS: { id: string; label: string; Icon: LucideIcon; symbols: string[] }[] = [
  { id: "airlines",  label: "Airlines",         Icon: Plane,     symbols: basket("airlines") },
  { id: "insurance", label: "Insurance giants", Icon: Briefcase, symbols: basket("insurance-giants") },
  { id: "ai",        label: "AI megatrend",     Icon: Bot,       symbols: basket("ai-megatrend") },
  { id: "us-mega",   label: "US megacap",       Icon: Castle,    symbols: basket("us-megacap") },
  { id: "mib-core",  label: "FTSE MIB core",    Icon: Landmark,  symbols: basket("ftse-mib-core") },
];