/**
 * Deterministic ranking used by the thematic deep-dive. Shared between the
 * edge function (compact copy) and the Vitest suite so scoring stays honest.
 */
import type { ExposureTier, RankedCompany } from "./schema";

const EXPOSURE_BONUS: Record<ExposureTier, number> = {
  "pure-play": 25,
  partial: 12,
  adjacent: 4,
};

export interface ScoreInput {
  exposure: ExposureTier;
  revGrowth?: number | null;   // decimal, e.g. 0.35 = 35%
  pe?: number | null;
  sentiment?: number | null;   // -1..+1
  marketCap?: number | null;   // USD
  discoveryMode?: boolean;
}

/** Composite score, higher = more attractive. Roughly 0..100 in practice. */
export function scoreCompany(x: ScoreInput): number {
  const growth = Number.isFinite(x.revGrowth) && (x.revGrowth as number) > -1
    ? Math.max(-0.5, Math.min(1.5, x.revGrowth as number)) * 40
    : 0;
  const value =
    Number.isFinite(x.pe) && (x.pe as number) > 0
      ? Math.min(15, 100 / (x.pe as number))
      : 0;
  const sent = Number.isFinite(x.sentiment) ? (x.sentiment as number) * 10 : 0;
  const exposureBonus = EXPOSURE_BONUS[x.exposure];
  let discovery = 0;
  if (x.discoveryMode && Number.isFinite(x.marketCap) && (x.marketCap as number) > 0) {
    // Lift smaller caps: micro/small get roughly +15..+8, mega ~0.
    const logMcap = Math.log10(x.marketCap as number);
    discovery = Math.max(0, 20 - Math.max(0, logMcap - 8) * 3);
  }
  return Math.round((growth + value + sent + exposureBonus + discovery) * 10) / 10;
}

export function rankCompanies<T extends RankedCompany>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.symbol.localeCompare(b.symbol);
  });
}

/**
 * Infer a coarse region from a Yahoo ticker suffix. Symbols without a suffix
 * are treated as North American listings.
 */
export function regionFromSymbol(sym: string): "na" | "eu" | "asia" | "other" {
  const s = sym.toUpperCase();
  if (!s.includes(".")) return "na";
  const suffix = s.split(".").pop() ?? "";
  const eu = new Set(["L", "PA", "AS", "DE", "MI", "MC", "SW", "BR", "LS", "VI", "ST", "HE", "CO", "OL", "IR"]);
  const asia = new Set(["T", "HK", "SS", "SZ", "KS", "KQ", "TW", "TWO", "SI", "BO", "NS", "AX", "NZ"]);
  if (eu.has(suffix)) return "eu";
  if (asia.has(suffix)) return "asia";
  return "other";
}

export function bandFromMarketCap(mcap: number | null | undefined): "large" | "mid" | "small" | "unknown" {
  if (!mcap || !Number.isFinite(mcap)) return "unknown";
  if (mcap >= 10_000_000_000) return "large";
  if (mcap >= 2_000_000_000) return "mid";
  return "small";
}