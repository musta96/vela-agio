import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getQuoteTool from "./tools/get-quote";
import searchStrategiesTool from "./tools/search-strategies";
import getWatchlistTool from "./tools/get-watchlist";
import getPortfolioTool from "./tools/get-portfolio";
import getNetWorthTool from "./tools/get-net-worth";
import listCashFlowTool from "./tools/list-cash-flow";
import addCashFlowEntryTool from "./tools/add-cash-flow-entry";
import projectDividendsTool from "./tools/project-dividends";
import runBacktestTool from "./tools/run-backtest";

// The OAuth issuer MUST be the direct Supabase host; construct it from the
// project ref (Vite inlines this literal at build time, keeping the entry
// import-safe — no runtime env reads at module top-level).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "vela",
  title: "Vela — Trading Strategy Platform",
  version: "1.0.0",
  instructions:
    "Tools for Vela.ai. Public tools: `get_quote` (any Yahoo-style ticker), `search_strategies`, and `project_dividends` (deterministic dividend income projections with optional real-position seeding). Authenticated tools return the signed-in user's own data or run compute on their behalf: `get_watchlist`, `get_portfolio`, `get_net_worth`, `list_cash_flow`, `add_cash_flow_entry`, and `run_backtest` (rate-limited historical backtest with CAGR / drawdown / hit-rate).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    getQuoteTool,
    searchStrategiesTool,
    getWatchlistTool,
    getPortfolioTool,
    getNetWorthTool,
    listCashFlowTool,
    addCashFlowEntryTool,
    projectDividendsTool,
    runBacktestTool,
  ],
});