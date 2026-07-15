// Public entry-point for the advanced technical analysis engine.
// Exposes a single `analyzeAll(bars)` that returns everything the UI needs.

export * from "./types";
export { detectCandlestickPatterns, recentCandlePatterns } from "./candlesticks";
export { findPivots, supportResistance, findTrendlines, detectStructure } from "./structure";
export { detectFVGs, detectOrderBlocks, detectLiquidityGrabs, detectSupplyDemand } from "./smc";
export { detectChartPatterns } from "./chartPatterns";
export { computeInsights } from "./insights";
export { computeTradePlan, type TradePlan, type PlanInputs } from "./planner";

import type { Bar } from "./types";
import { detectCandlestickPatterns } from "./candlesticks";
import { supportResistance, findTrendlines, detectStructure } from "./structure";
import { detectFVGs, detectOrderBlocks, detectLiquidityGrabs, detectSupplyDemand } from "./smc";
import { detectChartPatterns } from "./chartPatterns";
import { computeInsights } from "./insights";

export interface FullAnalysis {
  candlestickPatterns: ReturnType<typeof detectCandlestickPatterns>;
  supportResistance: ReturnType<typeof supportResistance>;
  trendlines: ReturnType<typeof findTrendlines>;
  fvgs: ReturnType<typeof detectFVGs>;
  orderBlocks: ReturnType<typeof detectOrderBlocks>;
  liquidityGrabs: ReturnType<typeof detectLiquidityGrabs>;
  supplyDemand: ReturnType<typeof detectSupplyDemand>;
  chartPatterns: ReturnType<typeof detectChartPatterns>;
  structure: ReturnType<typeof detectStructure>;
  insights: ReturnType<typeof computeInsights>;
}

export function analyzeAll(bars: Bar[]): FullAnalysis {
  return {
    candlestickPatterns: detectCandlestickPatterns(bars),
    supportResistance: supportResistance(bars),
    trendlines: findTrendlines(bars),
    fvgs: detectFVGs(bars),
    orderBlocks: detectOrderBlocks(bars),
    liquidityGrabs: detectLiquidityGrabs(bars),
    supplyDemand: detectSupplyDemand(bars),
    chartPatterns: detectChartPatterns(bars),
    structure: detectStructure(bars),
    insights: computeInsights(bars),
  };
}