import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getQuoteTool from "./tools/get-quote";
import searchStrategiesTool from "./tools/search-strategies";
import getWatchlistTool from "./tools/get-watchlist";
import getPortfolioTool from "./tools/get-portfolio";

// The OAuth issuer MUST be the direct Supabase host; construct it from the
// project ref (Vite inlines this literal at build time, keeping the entry
// import-safe — no runtime env reads at module top-level).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "vela",
  title: "Vela — Trading Strategy Platform",
  version: "1.0.0",
  instructions:
    "Tools for Vela.ai. Use `get_quote` for any Yahoo-style ticker and `search_strategies` to browse the strategy library (both public). Authenticated tools (`get_watchlist`, `get_portfolio`) return the signed-in user's own data.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getQuoteTool, searchStrategiesTool, getWatchlistTool, getPortfolioTool],
});