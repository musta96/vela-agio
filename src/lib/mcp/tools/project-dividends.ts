import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { projectDividends } from "../../dividends/project";

/**
 * Public MCP tool — no auth needed. Deterministic pure computation so
 * external agents (ChatGPT / Claude / Codex) can automate dividend
 * planning without pulling private user data. If the caller wants to
 * seed from real holdings, they can pass a `positions` array explicitly.
 */
export default defineTool({
  name: "project_dividends",
  title: "Project future dividend income",
  description:
    "Model annual dividend income for a given horizon using contributions, dividend yield, dividend growth, price appreciation, tax rate and optional DRIP. Accepts an optional `positions` array to seed the starting value and blended yield from real holdings. Returns per-year rows (portfolio value, gross/net dividends, yield on cost) plus totals.",
  inputSchema: {
    starting_value: z.number().describe("Starting portfolio value in the projection currency."),
    monthly_contribution: z.number().describe("Monthly cash added to the portfolio."),
    contribution_growth_pct: z.number().describe("Annual growth of monthly contributions in percent."),
    dividend_yield_pct: z.number().describe("Starting annual dividend yield in percent."),
    dividend_growth_pct: z.number().describe("Annual dividend growth rate in percent (DGR)."),
    price_growth_pct: z.number().describe("Annual price appreciation in percent."),
    tax_pct: z.number().describe("Dividend withholding/income tax rate in percent."),
    years: z.number().describe("Projection horizon in years."),
    reinvest: z.boolean().describe("If true, net dividends buy new shares (DRIP)."),
    payout_frequency: z.number().describe("Payouts per year: 1, 2, 4 or 12."),
    reinvest_rate_pct: z.number().optional().describe("Optional global DRIP rate 0-100 overriding `reinvest`. Ignored if any position sets `drip_pct`."),
    positions: z
      .array(
        z.object({
          symbol: z.string(),
          shares: z.number(),
          price: z.number(),
          yield_pct: z.number(),
          next_payout_month: z.number().optional(),
          drip_pct: z.number().optional(),
        }),
      )
      .optional()
      .describe("Optional real holdings. When provided, seed the starting value and blended yield from these positions."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (args) => {
    const freq = [1, 2, 4, 12].includes(args.payout_frequency) ? (args.payout_frequency as 1 | 2 | 4 | 12) : 4;
    const result = projectDividends({
      startingValue: args.starting_value,
      monthlyContribution: args.monthly_contribution,
      contributionGrowthPct: args.contribution_growth_pct,
      dividendYieldPct: args.dividend_yield_pct,
      dividendGrowthPct: args.dividend_growth_pct,
      priceGrowthPct: args.price_growth_pct,
      taxPct: args.tax_pct,
      years: Math.max(1, Math.min(60, Math.round(args.years))),
      reinvest: args.reinvest,
      payoutFrequency: freq,
      reinvestRatePct: args.reinvest_rate_pct,
      positions: args.positions?.map((p) => ({
        symbol: p.symbol,
        shares: p.shares,
        price: p.price,
        yieldPct: p.yield_pct,
        nextPayoutMonth: p.next_payout_month,
        dripPct: p.drip_pct,
      })),
    });
    const summary = {
      final_portfolio: Math.round(result.finalPortfolio),
      final_annual_net_income: Math.round(result.finalNetIncome),
      final_monthly_net_income: Math.round(result.finalNetIncome / 12),
      total_contributions: Math.round(result.totalContrib),
      total_reinvested: Math.round(result.totalReinvested),
      total_gross_dividends: Math.round(result.totalGross),
      total_net_dividends: Math.round(result.totalNet),
      yield_on_cost_pct: Number((result.yieldOnCost * 100).toFixed(3)),
      blended_start_yield_pct: Number(result.blendedStartYieldPct.toFixed(3)),
      blended_drip_pct: Number(result.blendedDripPct.toFixed(2)),
      seeded_from_positions: result.seededFromPositions,
    };
    const rows = result.rows.map((r) => ({
      year: r.year,
      contributions: Math.round(r.contributions),
      reinvested: Math.round(r.reinvested),
      portfolio: Math.round(r.portfolio),
      gross_dividends: Math.round(r.grossDividends),
      net_dividends: Math.round(r.netDividends),
      yield_on_cost_pct: Number((r.yieldOnCost * 100).toFixed(3)),
    }));
    const payload = { summary, rows };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  },
});