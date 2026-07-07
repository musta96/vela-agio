import type { SpreadLeg } from "@/components/options/SpreadBuilder";

export const CONTRACT_MULT = 100;

export interface LegPricing {
  leg: SpreadLeg;
  mid: number;
}

/** Intrinsic payoff of a single option contract at expiration (per share). */
export function legIntrinsic(side: "call" | "put", strike: number, S: number): number {
  return side === "call" ? Math.max(S - strike, 0) : Math.max(strike - S, 0);
}

/** Net premium in dollars. Positive = debit paid, negative = credit received. */
export function netPremium(legs: LegPricing[]): number {
  let cost = 0;
  for (const { leg, mid } of legs) {
    const sign = leg.action === "buy" ? 1 : -1;
    cost += sign * mid * CONTRACT_MULT * leg.qty;
  }
  return cost;
}

/** Total P/L at expiration for a given underlying price. */
export function payoffAt(legs: LegPricing[], S: number, premium: number): number {
  let intrinsic = 0;
  for (const { leg } of legs) {
    const sign = leg.action === "buy" ? 1 : -1;
    intrinsic += sign * legIntrinsic(leg.side, leg.strike, S) * CONTRACT_MULT * leg.qty;
  }
  return intrinsic - premium;
}

export interface PayoffPoint { S: number; pnl: number; }

export function buildPayoffCurve(
  legs: LegPricing[],
  spot: number | null,
  steps = 121,
): { points: PayoffPoint[]; premium: number; breakevens: number[]; maxProfit: number; maxLoss: number } {
  const premium = netPremium(legs);
  const strikes = legs.map((l) => l.leg.strike);
  const anchor = spot ?? (strikes.reduce((a, b) => a + b, 0) / Math.max(1, strikes.length));
  const lo = Math.max(0.01, Math.min(...strikes, anchor) * 0.6);
  const hi = Math.max(...strikes, anchor) * 1.4;
  const step = (hi - lo) / (steps - 1);
  const points: PayoffPoint[] = [];
  for (let i = 0; i < steps; i++) {
    const S = lo + i * step;
    points.push({ S, pnl: payoffAt(legs, S, premium) });
  }

  // Breakevens via linear interpolation between sign changes
  const breakevens: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if ((a.pnl <= 0 && b.pnl >= 0) || (a.pnl >= 0 && b.pnl <= 0)) {
      if (a.pnl === b.pnl) continue;
      const t = -a.pnl / (b.pnl - a.pnl);
      breakevens.push(a.S + t * (b.S - a.S));
    }
  }

  // Sample far tails to estimate whether max profit/loss is unbounded
  const tailLo = payoffAt(legs, 0.0001, premium);
  const tailHi = payoffAt(legs, hi * 5, premium);
  const inRangeMax = Math.max(...points.map((p) => p.pnl));
  const inRangeMin = Math.min(...points.map((p) => p.pnl));
  const maxProfit = Math.max(inRangeMax, tailLo, tailHi) === Infinity ? Infinity : Math.max(inRangeMax, tailLo, tailHi);
  const maxLoss = Math.min(inRangeMin, tailLo, tailHi);

  return { points, premium, breakevens, maxProfit, maxLoss };
}