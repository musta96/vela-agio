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
import startRunTool from "./tools/start-run";
import { getRunStatus, getRunResult, getRunLogs } from "./tools/get-run";
import watchlistUpdatesTool from "./tools/watchlist-updates";
import listToolDocsTool from "./tools/list-tool-docs";

// The OAuth issuer MUST be the direct Supabase host; construct it from the
// project ref (Vite inlines this literal at build time, keeping the entry
// import-safe — no runtime env reads at module top-level).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "vela",
  title: "Vela — Trading Strategy Platform",
  version: "1.0.0",
  instructions:
    "Tools for Vela.ai. Public tools: `get_quote`, `search_strategies`, `project_dividends`, `list_tool_docs` (human-readable catalog of every tool with inputs/outputs/auth). Authenticated tools operate as the signed-in Vela user under RLS: `get_watchlist`, `get_portfolio`, `get_net_worth`, `list_cash_flow`, `add_cash_flow_entry`, `run_backtest` (synchronous), `start_run` (async backtest or sensitivity sweep), `get_run_status`, `get_run_result`, `get_run_logs` (worker logs / debug), and `watchlist_updates` (polling snapshot of quotes, dividends, and alerts with an incremental `since` cursor).",
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
    startRunTool,
    getRunStatus,
    getRunResult,
    getRunLogs,
    watchlistUpdatesTool,
    listToolDocsTool,
  ],
});