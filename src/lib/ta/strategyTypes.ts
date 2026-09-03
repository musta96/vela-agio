// Rule schema for the Strategy Builder → Backtest bridge.
// Kept minimal & serializable so the same JSON runs client-side (preview) and server-side (backtest).

export type ConditionType =
  | "rsi_below"
  | "rsi_above"
  | "sma_cross_up"
  | "sma_cross_down"
  | "price_above_sma"
  | "price_below_sma"
  | "macd_cross_up"
  | "macd_cross_down"
  | "volume_spike"
  | "price_pct_change"
  | "ema_cross_up"
  | "ema_cross_down"
  | "atr_breakout"
  | "adx_above"
  | "avwap_sweep_reclaim"
  | "candlestick_pattern"
  | "support_reclaim"
  | "resistance_rejection"
  | "liquidity_sweep_bullish"
  | "liquidity_sweep_bearish"
  | "order_block_touch_bullish"
  | "order_block_touch_bearish"
  | "fib_golden_zone"
  | "avwap_cross_up"
  | "avwap_cross_down"
  | "volume_profile_above_poc"
  | "volume_profile_below_poc"
  | "trendline_break_up"
  | "trendline_break_down";

export interface Condition {
  type: ConditionType;
  value?: number;
  period?: number;
  fast?: number;
  slow?: number;
  pattern?: string;
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
  version?: number;
  parent_id?: string | null;
}

export interface TradingStrategyVersionRow {
  id: string;
  strategy_id: string;
  user_id: string;
  version: number;
  name: string;
  description: string | null;
  symbol: string | null;
  timeframe: string | null;
  entry_rules: Condition[];
  exit_rules: Condition[];
  risk_config: RiskConfig;
  change_note: string | null;
  created_at: string;
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
  ema_cross_up: "EMA fast crosses ABOVE slow",
  ema_cross_down: "EMA fast crosses BELOW slow",
  atr_breakout: "ATR breakout (bar range × ATR14)",
  adx_above: "ADX(14) above threshold",
  avwap_sweep_reclaim: "Liquidity sweep reclaimed within AVWAP value area",
  candlestick_pattern: "Candlestick pattern",
  support_reclaim: "Support reclaimed",
  resistance_rejection: "Resistance rejected",
  liquidity_sweep_bullish: "Bullish liquidity sweep",
  liquidity_sweep_bearish: "Bearish liquidity sweep",
  order_block_touch_bullish: "Bullish order block touched",
  order_block_touch_bearish: "Bearish order block touched",
  fib_golden_zone: "Price in Fibonacci golden zone",
  avwap_cross_up: "Price crosses above anchored VWAP",
  avwap_cross_down: "Price crosses below anchored VWAP",
  volume_profile_above_poc: "Price above volume-profile POC",
  volume_profile_below_poc: "Price below volume-profile POC",
  trendline_break_up: "Breaks downtrend",
  trendline_break_down: "Breaks uptrend",
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
    case "ema_cross_up": return `EMA(${c.fast ?? 12}) crosses above EMA(${c.slow ?? 26})`;
    case "ema_cross_down": return `EMA(${c.fast ?? 12}) crosses below EMA(${c.slow ?? 26})`;
    case "atr_breakout": return `Bar range > ${c.value ?? 1.5}× ATR(14)`;
    case "adx_above": return `ADX(14) > ${c.value ?? 25}`;
    case "avwap_sweep_reclaim": return `Sweep reclaimed within ±${c.value ?? 1.5}% AVWAP band (lookback ${c.period ?? 40})`;
    case "candlestick_pattern": return `${c.pattern ?? "Any"} candlestick pattern`;
    case "support_reclaim": return `Close reclaims support within ${c.value ?? 1.5}%`;
    case "resistance_rejection": return `Close rejects resistance within ${c.value ?? 1.5}%`;
    case "liquidity_sweep_bullish": return `Bullish liquidity sweep (lookback ${c.period ?? 40})`;
    case "liquidity_sweep_bearish": return `Bearish liquidity sweep (lookback ${c.period ?? 40})`;
    case "order_block_touch_bullish": return `Touches bullish order block (lookback ${c.period ?? 60})`;
    case "order_block_touch_bearish": return `Touches bearish order block (lookback ${c.period ?? 60})`;
    case "fib_golden_zone": return `Price in Fibonacci golden zone (lookback ${c.period ?? 60})`;
    case "avwap_cross_up": return `Price crosses above AVWAP (anchor ${c.period ?? 60} bars)`;
    case "avwap_cross_down": return `Price crosses below AVWAP (anchor ${c.period ?? 60} bars)`;
    case "volume_profile_above_poc": return `Price above volume-profile POC (${c.period ?? 60} bars)`;
    case "volume_profile_below_poc": return `Price below volume-profile POC (${c.period ?? 60} bars)`;
    case "trendline_break_up": return `Breaks downtrend (${c.period ?? 60} bars)`;
    case "trendline_break_down": return `Breaks uptrend (${c.period ?? 60} bars)`;
  }
}
