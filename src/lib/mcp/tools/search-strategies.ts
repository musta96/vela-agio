import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const STRATEGY_CATALOG = [
  {
    id: "buy_hold",
    name: "Buy & Hold",
    category: "Passive",
    summary:
      "Buy the asset on day 1, hold for the entire window. The baseline every active strategy must beat.",
    risk: "low",
    horizon: "long",
  },
  {
    id: "sma_cross",
    name: "SMA 20/50 Crossover",
    category: "Trend following",
    summary:
      "Long when the 20-day simple moving average crosses above the 50-day SMA, flat otherwise.",
    risk: "medium",
    horizon: "medium",
  },
  {
    id: "rsi",
    name: "RSI Mean Reversion (30/70)",
    category: "Mean reversion",
    summary:
      "Buy when 14-day RSI dips below 30 (oversold), sell when it rises above 70 (overbought).",
    risk: "medium",
    horizon: "short",
  },
];

export default defineTool({
  name: "search_strategies",
  title: "Search strategies",
  description:
    "Search Vela's strategy library by free-text query (name, category, risk, horizon). Public — no auth required.",
  inputSchema: {
    query: z.string().default("").describe('Free-text query, e.g. "momentum", "mean reversion", "low risk"'),
    limit: z.number().int().min(1).max(50).default(10).describe("Max results (1–50)"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }) => {
    const q = (query || "").toLowerCase().trim();
    const rows = q
      ? STRATEGY_CATALOG.filter((s) =>
          `${s.name} ${s.category} ${s.summary} ${s.id} ${s.risk} ${s.horizon}`
            .toLowerCase()
            .includes(q),
        )
      : STRATEGY_CATALOG;
    const result = { count: rows.length, strategies: rows.slice(0, limit) };
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
});