// Web Worker that runs `simulateCustom` off the main thread so we can
// fan a parameter sweep out over every available CPU core.
// Kept intentionally tiny — the cache + pool orchestration live in simCache.ts.

import { simulateCustom, type Bar, type SimResult } from "./clientSim";
import type { Condition, RiskConfig } from "@/lib/ta/strategyTypes";
import type { CostConfig } from "./costs";

interface Job {
  id: number;
  bars: Bar[];
  rules: { entry: Condition[]; exit: Condition[]; risk: RiskConfig };
  initial: number;
  costs: CostConfig;
}

self.onmessage = (ev: MessageEvent<Job>) => {
  const { id, bars, rules, initial, costs } = ev.data;
  const result: SimResult = simulateCustom(bars, rules, initial, costs);
  (self as unknown as Worker).postMessage({ id, result });
};