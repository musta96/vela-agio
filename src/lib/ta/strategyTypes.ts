// Rule schema for the Strategy Builder → Backtest bridge.
// Kept minimal & serializable so the same JSON runs client-side (preview) and server-side (backtest).

export type ConditionType =
  | "rsi_below"
  | "rsi_above"
  | "sma_cross_up"        // fast SMA crosses above slow
  | "sma_cross_down"      // fast crosses below slow
  | "price_above_sma"
  | "price_below_sma"
  | "macd_cross_up"
  | "macd_cross_down"
  | "volume_spike"        // volume > multiplier × 20-bar avg
  | "price_pct_change";   // close vs N bars ago >= value (or <= if negative)

export interface Condition {
  type: ConditionType;
  // Common numeric fields, condition-specific meaning:
  value?: number;        // rsi threshold, pct change, multiplier
  period?: number;       // sma period, lookback bars
  fast?: number;         // sma_cross fast period
  slow?: number;         // sma_cross slow period
}

export type ExitType = "signal" | "target_pct" | "stop_pct" | "target_rr" | "atr_stop";
export interface RiskConfig {
  stopPct?: number;   // e.g. 5 => 5% stop-loss
  targetPct?: number; // e.g. 10 => 10% take-profit
  atrStopMult?: number; // ATR multiplier for stop
  riskPct?: number;   // % of equity risked per trade
}

export interface StrategyRule {
  entry: Condition[]; // AND
  exit: Condition[];  // AND (any-of not supported yet — keep simple)
  risk: RiskConfig;
}

export interface TradingStrategyRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  symbol: string | null;
  timeframe: string | null;
  entry_rules: Condition[];
  exit_rules: Condition[];
  risk_config: RiskConfig;
  created_at: string;
  updated_at: string;
}

export const CONDITION_LABELS: Record<ConditionType, string> = {
  rsi_below: "RSI below",
  rsi_above: "RSI above",
  sma_cross_up: "SMA fast crosses ABOVE slow",
  sma_cross_down: "SMA fast crosses BELOW slow",
  price_above_sma: "Price above SMA",
  price_below_sma: "Price below SMA",
  macd_cross_up: "MACD bullish cross",
  macd_cross_down: "MACD bearish cross",
  volume_spike: "Volume spike (× avg)",
  price_pct_change: "Price % change (N bars)",
};

export function describeCondition(c: Condition): string {
  switch (c.type) {
    case "rsi_below": return `RSI(14) < ${c.value ?? 30}`;
    case "rsi_above": return `RSI(14) > ${c.value ?? 70}`;
    case "sma_cross_up": return `SMA(${c.fast ?? 20}) crosses above SMA(${c.slow ?? 50})`;
    case "sma_cross_down": return `SMA(${c.fast ?? 20}) crosses below SMA(${c.slow ?? 50})`;
    case "price_above_sma": return `Price > SMA(${c.period ?? 50})`;
    case "price_below_sma": return `Price < SMA(${c.period ?? 50})`;
    case "macd_cross_up": return "MACD crosses above signal";
    case "macd_cross_down": return "MACD crosses below signal";
    case "volume_spike": return `Volume > ${c.value ?? 2}× 20-bar avg`;
    case "price_pct_change": return `Close change over ${c.period ?? 5} bars ≥ ${c.value ?? 5}%`;
  }
}
