export interface CostConfig {
  commissionPct?: number;
  commissionFlat?: number;
  slippageBps?: number;
}

export const DEFAULT_COSTS: CostConfig = {
  commissionPct: 0.05,   // 5 bps commission on notional
  commissionFlat: 0,
  slippageBps: 5,        // 5 bps slippage per side
};

export function costsSummary(c: CostConfig): string {
  const parts: string[] = [];
  if (c.commissionPct) parts.push(`${c.commissionPct}% commission`);
  if (c.commissionFlat) parts.push(`${c.commissionFlat} flat / trade`);
  if (c.slippageBps)   parts.push(`${c.slippageBps} bps slippage`);
  return parts.length ? parts.join(" · ") : "Frictionless";
}