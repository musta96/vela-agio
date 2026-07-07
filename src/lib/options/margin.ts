import type { SpreadLeg } from "@/components/options/SpreadBuilder";
import { CONTRACT_MULT, type LegPricing } from "./payoff";

export type MarginSeverity = "info" | "warn" | "danger";
export interface MarginWarning {
  severity: MarginSeverity;
  message: string;
}
export interface MarginResult {
  /** Positive = debit, negative = credit (in $) */
  net: number;
  /** Reg-T style initial requirement in $ (excludes premium already netted) */
  requirement: number;
  /** Estimated worst-case loss at expiration; Infinity if unbounded */
  maxLoss: number;
  /** True if any leg carries theoretically unlimited loss (naked short call) */
  unbounded: boolean;
  warnings: MarginWarning[];
  /** Human-readable structure summary */
  structure: string;
}

interface Bucket {
  side: "call" | "put";
  longs: LegPricing[];
  shorts: LegPricing[];
}

function bucket(legs: LegPricing[]): { call: Bucket; put: Bucket } {
  const call: Bucket = { side: "call", longs: [], shorts: [] };
  const put: Bucket = { side: "put", longs: [], shorts: [] };
  for (const l of legs) {
    const b = l.leg.side === "call" ? call : put;
    (l.leg.action === "buy" ? b.longs : b.shorts).push(l);
  }
  return { call, put };
}

/**
 * Reg-T style initial margin for a same-expiration option combo.
 * Simplified: assumes all legs share expiration/underlying (as in the spread builder).
 */
export function computeRegTMargin(legs: LegPricing[], spot: number | null): MarginResult {
  const warnings: MarginWarning[] = [];
  if (!legs.length) {
    return { net: 0, requirement: 0, maxLoss: 0, unbounded: false, warnings, structure: "empty" };
  }

  // Net premium: + debit, - credit
  let net = 0;
  for (const { leg, mid } of legs) {
    const sign = leg.action === "buy" ? 1 : -1;
    net += sign * mid * CONTRACT_MULT * leg.qty;
  }

  const { call, put } = bucket(legs);
  let requirement = 0;
  let maxLoss = 0;
  let unbounded = false;
  const parts: string[] = [];

  for (const b of [call, put]) {
    // Sort for pairing: shorts by strike, longs by strike
    const shorts = b.shorts.flatMap((l) => Array(l.leg.qty).fill(l.leg));
    const longs = b.longs.flatMap((l) => Array(l.leg.qty).fill(l.leg));
    // Pair each short with the best-covering long
    for (const s of shorts) {
      // For a short call, covered by a long call at any strike (best is lowest strike >= any).
      // Reg-T vertical requirement = max(0, width) * 100 for defined-risk spreads.
      let bestIdx = -1;
      let bestWidth = Infinity;
      for (let i = 0; i < longs.length; i++) {
        const L = longs[i];
        // Same-side already true. Define directional width:
        // Bear call spread (short lower call, long higher call): width = longK - shortK
        // Bull put spread (short higher put, long lower put): width = shortK - longK
        const width = b.side === "call" ? L.strike - s.strike : s.strike - L.strike;
        if (width >= 0 && width < bestWidth) { bestWidth = width; bestIdx = i; }
      }
      if (bestIdx >= 0 && Number.isFinite(bestWidth)) {
        const L = longs.splice(bestIdx, 1)[0];
        const req = bestWidth * CONTRACT_MULT;
        requirement += req;
        // Max loss on the paired vertical = width*100 - net credit + net debit on this pair (we approximate via net after loop)
        maxLoss += req;
        parts.push(`${b.side} vertical ${s.strike}/${L.strike} (width $${bestWidth.toFixed(2)})`);
      } else {
        // Naked short
        if (b.side === "call") {
          unbounded = true;
          // Reg-T naked call: max(20% * spot - OTM, 10% * spot) * 100 + premium
          const S = spot ?? s.strike;
          const otm = Math.max(0, s.strike - S);
          const req = Math.max(0.2 * S - otm, 0.1 * S) * CONTRACT_MULT;
          requirement += req;
          maxLoss = Infinity;
          parts.push(`naked short call @ ${s.strike}`);
          warnings.push({ severity: "danger", message: `Naked short call @ ${s.strike} — theoretically unlimited loss.` });
        } else {
          const S = spot ?? s.strike;
          const otm = Math.max(0, S - s.strike);
          const req = Math.max(0.2 * S - otm, 0.1 * s.strike) * CONTRACT_MULT;
          requirement += req;
          // Max loss on cash-secured put = strike*100
          maxLoss += s.strike * CONTRACT_MULT;
          parts.push(`naked short put @ ${s.strike}`);
          warnings.push({ severity: "warn", message: `Naked short put @ ${s.strike} — max loss $${(s.strike * CONTRACT_MULT).toFixed(0)} per contract (assignment risk).` });
        }
      }
    }
    // Remaining longs: debit only, no additional margin.
    for (const L of longs) parts.push(`long ${b.side} @ ${L.strike}`);
  }

  // Info messages
  if (net > 0) warnings.push({ severity: "info", message: `Net debit $${net.toFixed(2)} — this cash leaves your account when filled.` });
  else if (net < 0) warnings.push({ severity: "info", message: `Net credit $${(-net).toFixed(2)} — held as collateral against the requirement below.` });

  if (requirement > 0) {
    warnings.push({
      severity: "warn",
      message: `Reg-T initial margin ≈ $${requirement.toFixed(0)}. Broker requirement may be higher for portfolio-margin or naked positions.`,
    });
  }

  return {
    net,
    requirement,
    maxLoss,
    unbounded,
    warnings,
    structure: parts.join(", ") || "single leg",
  };
}

export function validateLegs(legs: SpreadLeg[]): MarginWarning[] {
  const warnings: MarginWarning[] = [];
  if (legs.length > 1) {
    // Same strike + same side + opposite action = wash
    const seen = new Map<string, SpreadLeg>();
    for (const l of legs) {
      const key = `${l.side}-${l.strike}`;
      const prev = seen.get(key);
      if (prev && prev.action !== l.action) {
        warnings.push({ severity: "warn", message: `${l.side.toUpperCase()} ${l.strike} has both buy and sell legs — cancels out.` });
      }
      seen.set(key, l);
    }
  }
  return warnings;
}