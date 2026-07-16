import type { Condition, ConditionType, RiskConfig } from "./strategyTypes";

export type IssueLevel = "error" | "warning";
export interface RuleIssue {
  level: IssueLevel;
  scope: "entry" | "exit" | "risk" | "global";
  index?: number;
  message: string;
}

// Fields required per condition type + sensible bounds
const REQUIRED: Record<ConditionType, { fields: (keyof Condition)[]; describe: string }> = {
  rsi_below:        { fields: ["value"],           describe: "RSI threshold" },
  rsi_above:        { fields: ["value"],           describe: "RSI threshold" },
  sma_cross_up:     { fields: ["fast", "slow"],    describe: "fast & slow SMA periods" },
  sma_cross_down:   { fields: ["fast", "slow"],    describe: "fast & slow SMA periods" },
  price_above_sma:  { fields: ["period"],          describe: "SMA period" },
  price_below_sma:  { fields: ["period"],          describe: "SMA period" },
  macd_cross_up:    { fields: [],                  describe: "" },
  macd_cross_down:  { fields: [],                  describe: "" },
  volume_spike:     { fields: ["value"],           describe: "volume multiplier" },
  price_pct_change: { fields: ["value", "period"], describe: "% change and lookback bars" },
};

// Pairs of conditions that contradict each other when combined on the same side.
const CONTRADICTIONS: Array<[ConditionType, ConditionType, string]> = [
  ["rsi_below", "rsi_above", "RSI cannot be both below and above a threshold on the same side."],
  ["sma_cross_up", "sma_cross_down", "SMA cross up and cross down can't both fire on the same bar."],
  ["price_above_sma", "price_below_sma", "Price can't be above and below the same SMA simultaneously."],
  ["macd_cross_up", "macd_cross_down", "MACD bullish and bearish cross contradict each other."],
];

function validateCondition(c: Condition, scope: "entry" | "exit", index: number): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const spec = REQUIRED[c.type];
  if (!spec) return issues;
  for (const f of spec.fields) {
    const v = (c as any)[f];
    if (v === undefined || v === null || v === "" || Number.isNaN(Number(v))) {
      issues.push({ level: "error", scope, index, message: `Rule #${index + 1} is missing ${spec.describe || f as string}.` });
    }
  }
  // Bounds
  if ((c.type === "rsi_below" || c.type === "rsi_above") && c.value !== undefined) {
    if (c.value < 0 || c.value > 100)
      issues.push({ level: "error", scope, index, message: `RSI threshold must be between 0 and 100 (got ${c.value}).` });
    if (c.type === "rsi_below" && c.value >= 70)
      issues.push({ level: "warning", scope, index, message: `RSI below ${c.value} is unusually high for an oversold entry.` });
    if (c.type === "rsi_above" && c.value <= 30)
      issues.push({ level: "warning", scope, index, message: `RSI above ${c.value} is unusually low for an overbought exit.` });
  }
  if ((c.type === "sma_cross_up" || c.type === "sma_cross_down") && c.fast !== undefined && c.slow !== undefined) {
    if (c.fast >= c.slow)
      issues.push({ level: "error", scope, index, message: `Fast SMA (${c.fast}) must be shorter than slow SMA (${c.slow}).` });
  }
  if (c.type === "volume_spike" && c.value !== undefined && c.value <= 1)
    issues.push({ level: "warning", scope, index, message: `Volume multiplier ≤ 1 will match nearly every bar.` });
  if ((c.type === "price_above_sma" || c.type === "price_below_sma") && c.period !== undefined && c.period < 2)
    issues.push({ level: "error", scope, index, message: `SMA period must be at least 2 (got ${c.period}).` });
  return issues;
}

function findContradictions(list: Condition[], scope: "entry" | "exit"): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const types = new Set(list.map((c) => c.type));
  for (const [a, b, msg] of CONTRADICTIONS) {
    if (types.has(a) && types.has(b))
      issues.push({ level: "error", scope, message: `${scope === "entry" ? "Entry" : "Exit"}: ${msg}` });
  }
  // Duplicate conditions
  const seen = new Map<string, number>();
  list.forEach((c) => {
    const key = JSON.stringify(c);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  });
  for (const [key, n] of seen) {
    if (n > 1) {
      const c = JSON.parse(key) as Condition;
      issues.push({ level: "warning", scope, message: `Duplicate ${scope} rule "${c.type}" appears ${n} times.` });
    }
  }
  return issues;
}

// Cross-side checks: entry and exit should not fire on the same signal.
function crossSideChecks(entry: Condition[], exit: Condition[]): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const entryTypes = new Set(entry.map((c) => c.type));
  const exitTypes  = new Set(exit.map((c) => c.type));
  for (const [a, b] of [["sma_cross_up", "sma_cross_up"], ["macd_cross_up", "macd_cross_up"]] as [ConditionType, ConditionType][]) {
    if (entryTypes.has(a) && exitTypes.has(b))
      issues.push({ level: "warning", scope: "global", message: `"${a}" is used on both entry and exit — the same signal will trigger open and close.` });
  }
  // Entering long on overbought / exiting on oversold looks inverted
  if (entry.some((c) => c.type === "rsi_above") && exit.some((c) => c.type === "rsi_below"))
    issues.push({ level: "warning", scope: "global", message: "Entering on RSI overbought and exiting on RSI oversold looks inverted — double-check direction." });
  return issues;
}

function validateRisk(risk: RiskConfig): RuleIssue[] {
  const issues: RuleIssue[] = [];
  if (risk.stopPct !== undefined && risk.stopPct <= 0)
    issues.push({ level: "error", scope: "risk", message: "Stop-loss % must be positive." });
  if (risk.targetPct !== undefined && risk.targetPct <= 0)
    issues.push({ level: "error", scope: "risk", message: "Target % must be positive." });
  if (risk.riskPct !== undefined && (risk.riskPct <= 0 || risk.riskPct > 100))
    issues.push({ level: "error", scope: "risk", message: "Risk % per trade must be between 0 and 100." });
  if (risk.riskPct !== undefined && risk.riskPct > 5)
    issues.push({ level: "warning", scope: "risk", message: `Risking ${risk.riskPct}% per trade is aggressive — most desks cap at 1–2%.` });
  if (risk.stopPct && risk.targetPct && risk.targetPct / risk.stopPct < 1)
    issues.push({ level: "warning", scope: "risk", message: `Reward:Risk is below 1:1 (${(risk.targetPct / risk.stopPct).toFixed(2)}:1) — losing trades will outweigh winners.` });
  if (!risk.stopPct && !risk.targetPct)
    issues.push({ level: "warning", scope: "risk", message: "No stop-loss or target set — exits rely entirely on signal rules." });
  return issues;
}

export function validateStrategy(entry: Condition[], exit: Condition[], risk: RiskConfig): RuleIssue[] {
  const issues: RuleIssue[] = [];
  if (entry.length === 0) issues.push({ level: "error", scope: "entry", message: "Add at least one entry rule." });
  if (exit.length === 0 && !risk.stopPct && !risk.targetPct)
    issues.push({ level: "error", scope: "exit", message: "Add an exit rule or set a stop / target — trades would never close." });
  entry.forEach((c, i) => issues.push(...validateCondition(c, "entry", i)));
  exit.forEach((c, i) => issues.push(...validateCondition(c, "exit", i)));
  issues.push(...findContradictions(entry, "entry"));
  issues.push(...findContradictions(exit, "exit"));
  issues.push(...crossSideChecks(entry, exit));
  issues.push(...validateRisk(risk));
  return issues;
}

export function summarize(issues: RuleIssue[]) {
  return {
    errors: issues.filter((i) => i.level === "error"),
    warnings: issues.filter((i) => i.level === "warning"),
  };
}