// Trade planner helpers: risk:reward + position sizing.

export interface TradePlan {
  side: "long" | "short";
  entry: number;
  stop: number;
  target: number;
  riskPerShare: number;
  rewardPerShare: number;
  rr: number;              // reward / risk
  atrMultiple?: number;    // distance-to-stop in ATR multiples
  positionSize: number;    // shares/contracts
  positionValue: number;   // entry * size
  riskAmount: number;      // absolute $ risked
  warnings: string[];
}

export interface PlanInputs {
  side: "long" | "short";
  entry: number;
  stop: number;
  target: number;
  accountEquity: number;     // total account $
  riskPct: number;           // e.g. 1 => 1%
  atr?: number | null;
}

export function computeTradePlan(i: PlanInputs): TradePlan | null {
  if (!isFinite(i.entry) || !isFinite(i.stop) || !isFinite(i.target)) return null;
  if (i.entry <= 0 || i.stop <= 0 || i.target <= 0) return null;
  const riskPerShare = i.side === "long" ? i.entry - i.stop : i.stop - i.entry;
  const rewardPerShare = i.side === "long" ? i.target - i.entry : i.entry - i.target;
  if (riskPerShare <= 0) return null;
  const rr = rewardPerShare / riskPerShare;
  const riskAmount = (i.accountEquity * i.riskPct) / 100;
  const positionSize = Math.max(0, Math.floor(riskAmount / riskPerShare));
  const positionValue = positionSize * i.entry;
  const atrMultiple = i.atr && i.atr > 0 ? riskPerShare / i.atr : undefined;
  const warnings: string[] = [];
  if (rr < 1) warnings.push("Risk:Reward below 1 — the expected reward doesn't compensate the risk.");
  if (rr < 2) warnings.push("Aim for at least 2R to survive normal win-rate drawdowns.");
  if (atrMultiple != null && atrMultiple < 1) {
    warnings.push(`Stop distance is only ${atrMultiple.toFixed(2)}× ATR — likely to be knocked out by normal noise.`);
  }
  if (positionSize === 0) warnings.push("Risk budget too small vs. per-share risk — size rounds to 0. Increase equity or widen risk %.");
  return {
    side: i.side, entry: i.entry, stop: i.stop, target: i.target,
    riskPerShare, rewardPerShare, rr,
    atrMultiple, positionSize, positionValue, riskAmount, warnings,
  };
}