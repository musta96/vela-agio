/**
 * Single source of truth for net-worth category metadata (label, color, icon
 * key). Consumed by NetWorth.tsx (full management UI) AND the Dashboard
 * allocation donut so the two views can never disagree.
 */
import {
  Banknote, Briefcase, PiggyBank, Bitcoin, Home as HomeIcon, Car, Watch,
  Building2, Boxes, CreditCard,
} from "lucide-react";

export type CategoryKey =
  | "cash" | "investments" | "retirement" | "crypto" | "real_estate"
  | "vehicles" | "collectibles" | "private_equity" | "other_assets" | "liabilities";

export const CATEGORY_META: Record<CategoryKey, { label: string; icon: any; color: string; liability?: boolean; hint: string }> = {
  cash:           { label: "Cash & Equivalents",       icon: Banknote,   color: "hsl(142 70% 45%)", hint: "Checking, savings, money market, T-bills" },
  investments:    { label: "Investments",              icon: Briefcase,  color: "hsl(199 89% 48%)", hint: "Stocks, ETFs, bonds - link a Vela portfolio for live values" },
  retirement:     { label: "Retirement / Pension",     icon: PiggyBank,  color: "hsl(262 83% 58%)", hint: "401k, IRA, pension fund, fondo pensione" },
  crypto:         { label: "Crypto",                   icon: Bitcoin,    color: "hsl(38 92% 50%)",  hint: "Wallets, exchanges - link a crypto-only portfolio" },
  real_estate:    { label: "Real Estate",              icon: HomeIcon,   color: "hsl(173 70% 40%)", hint: "Primary home, rentals, land" },
  vehicles:       { label: "Vehicles",                 icon: Car,        color: "hsl(217 60% 55%)", hint: "Cars, motorcycles, boats" },
  collectibles:   { label: "Watches & Collectibles",   icon: Watch,      color: "hsl(340 70% 55%)", hint: "Watches, art, wine, jewelry" },
  private_equity: { label: "Private Equity / Business",icon: Building2,  color: "hsl(280 60% 55%)", hint: "Company shares, startups, partnerships" },
  other_assets:   { label: "Other Assets",             icon: Boxes,      color: "hsl(45 70% 50%)",  hint: "Loans receivable, royalties, anything else" },
  liabilities:    { label: "Liabilities",              icon: CreditCard, color: "hsl(0 75% 55%)",   liability: true, hint: "Mortgages, loans, credit cards" },
};

export const CATEGORY_ORDER: CategoryKey[] = [
  "cash","investments","retirement","crypto","real_estate","vehicles","collectibles","private_equity","other_assets","liabilities",
];