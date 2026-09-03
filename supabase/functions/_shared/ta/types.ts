// Shared types for the advanced technical-analysis engine.

export interface Bar {
  t: number; // ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type Bias = "bullish" | "bearish" | "neutral";

export interface CandlePatternHit {
  index: number;
  t: number;
  name: CandlePatternName;
  bias: Bias;
  // The candle body / wick anchor prices, used to render the flag near the bar.
  priceHigh: number;
  priceLow: number;
  description: string;
  // Suggested invalidation price if the pattern-implied trade fails.
  invalidation?: number;
}

export type CandlePatternName =
  | "Hammer"
  | "Inverted Hammer"
  | "Hanging Man"
  | "Shooting Star"
  | "Bullish Engulfing"
  | "Bearish Engulfing"
  | "Morning Star"
  | "Evening Star"
  | "Piercing Line"
  | "Dark Cloud Cover"
  | "Three White Soldiers"
  | "Three Black Crows"
  | "Dragonfly Doji"
  | "Gravestone Doji"
  | "Doji"
  | "Spinning Top"
  | "Marubozu";

export interface Pivot {
  index: number;
  t: number;
  price: number;
  kind: "high" | "low";
}

export interface SRZone {
  price: number;
  type: "support" | "resistance";
  touches: number;
  strength: number; // 0..1
}

export interface Trendline {
  kind: "up" | "down";
  from: { index: number; t: number; price: number };
  to: { index: number; t: number; price: number };
  slope: number;   // price per bar
  intercept: number; // price at index 0
  broken?: { index: number; t: number; price: number };
}

export interface FVG {
  index: number;      // middle bar of the 3-bar sequence
  t: number;
  bias: Bias;         // bullish gap or bearish gap
  top: number;
  bottom: number;
  filled?: boolean;
}

export interface OrderBlock {
  index: number;
  t: number;
  bias: Bias;         // bullish OB = last down candle before impulsive up
  top: number;
  bottom: number;
}

export interface LiquidityGrab {
  index: number;
  t: number;
  bias: Bias;         // bullish grab = swept lows then reclaimed
  sweptLevel: number;
  reclaimPrice: number;
}

export interface StructureShift {
  index: number;
  t: number;
  kind: "BOS" | "CHoCH";
  bias: Bias;
  level: number;
}

export interface SupplyDemandZone {
  from: { index: number; t: number };
  to: { index: number; t: number };
  top: number;
  bottom: number;
  bias: Bias; // demand = bullish, supply = bearish
  fresh: boolean;
}

export type ChartPatternName =
  | "Head & Shoulders"
  | "Inverse Head & Shoulders"
  | "Double Top"
  | "Double Bottom"
  | "Ascending Triangle"
  | "Descending Triangle"
  | "Symmetrical Triangle"
  | "Bull Flag"
  | "Bear Flag"
  | "Rising Wedge"
  | "Falling Wedge";

export interface ChartPatternHit {
  name: ChartPatternName;
  bias: Bias;
  from: number; // bar index
  to: number;
  keyPrice: number;   // neckline / trigger price
  target?: number;
  invalidation?: number;
}

export interface ActionableInsight {
  id: string;
  name: string;
  bias: Bias;
  confidence: "high" | "medium" | "low";
  detail: string;      // one-line value
  howToTrade: string;  // 1-2 sentence guidance
}