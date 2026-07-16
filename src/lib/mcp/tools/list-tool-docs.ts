import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

// Human-readable catalog of every tool exposed by this MCP server.
// The MCP `tools/list` protocol call already returns machine schemas; this tool
// gives external agents a compact markdown/JSON description including auth
// scope, rate limits, and usage notes.

interface ToolDoc {
  name: string;
  title: string;
  auth: "public" | "oauth-user";
  rate_limit: string | null;
  inputs: Record<string, string>;
  outputs: string;
  notes?: string;
  error_codes?: string[];
}

const DOCS: ToolDoc[] = [
  {
    name: "get_quote",
    title: "Get quote",
    auth: "public",
    rate_limit: null,
    inputs: { symbol: "Yahoo ticker, e.g. AAPL, ENI.MI, BTC-USD" },
    outputs: "{ symbol, name, price, change, change_pct, currency, exchange, as_of }",
  },
  {
    name: "search_strategies",
    title: "Search strategies",
    auth: "public",
    rate_limit: null,
    inputs: { query: "Free-text search over public strategy presets" },
    outputs: "{ items: [ { name, description, symbol, timeframe, ... } ] }",
  },
  {
    name: "project_dividends",
    title: "Project dividends",
    auth: "public",
    rate_limit: null,
    inputs: { symbol: "Ticker", shares: "Optional share count", years: "Projection horizon" },
    outputs: "{ projections: [{ year, income, cumulative }] }",
  },
  {
    name: "get_watchlist",
    title: "Get watchlist",
    auth: "oauth-user",
    rate_limit: "60 / 60s",
    inputs: {},
    outputs: "{ items: [{ symbol, name, created_at }] }",
  },
  {
    name: "get_portfolio",
    title: "Get portfolio",
    auth: "oauth-user",
    rate_limit: "60 / 60s",
    inputs: { portfolio_id: "Optional. Defaults to the user's primary portfolio." },
    outputs: "{ portfolio, holdings: [...] }",
  },
  {
    name: "get_net_worth",
    title: "Get net worth",
    auth: "oauth-user",
    rate_limit: "60 / 60s",
    inputs: {},
    outputs: "{ total, accounts: [...] }",
  },
  {
    name: "list_cash_flow",
    title: "List cash-flow entries",
    auth: "oauth-user",
    rate_limit: "60 / 60s",
    inputs: { since: "ISO date (optional)", limit: "1..200" },
    outputs: "{ entries: [...] }",
  },
  {
    name: "add_cash_flow_entry",
    title: "Add cash-flow entry",
    auth: "oauth-user",
    rate_limit: "30 / 60s",
    inputs: { amount: "number", currency: "ISO", kind: "income|expense|transfer", note: "string?" },
    outputs: "{ id, created_at }",
  },
  {
    name: "run_backtest",
    title: "Run backtest (synchronous)",
    auth: "oauth-user",
    rate_limit: "30 / 60s",
    inputs: { symbol: "Ticker", preset: "buy_hold|sma_cross|rsi", range: "6mo..max", initial_capital: "number", "fast/slow/rsi_*": "params" },
    outputs: "{ metrics: { cagr, maxDrawdown, sharpe, hitRate }, ... }",
    notes: "For sweeps or long jobs, prefer start_run + get_run_result.",
  },
  {
    name: "start_run",
    title: "Start backtest or sensitivity run",
    auth: "oauth-user",
    rate_limit: "10 / 60s",
    inputs: {
      kind: "backtest | sensitivity",
      input: "Backtest params; sensitivity adds `sweep` object with arrays for fast/slow/rsi_period/rsi_buy/rsi_sell (<=64 combos).",
    },
    outputs: "{ run_id, status }",
    notes: "Poll with get_run_status; fetch full data with get_run_result; debug with get_run_logs.",
  },
  {
    name: "get_run_status",
    title: "Get run status",
    auth: "oauth-user",
    rate_limit: "120 / 60s",
    inputs: { run_id: "UUID from start_run" },
    outputs: "{ status, progress, started_at, finished_at, canceled_at, cancel_requested, error }",
    error_codes: ["not_authenticated", "not_found", "db_error"],
  },
  {
    name: "get_run_result",
    title: "Get run result",
    auth: "oauth-user",
    rate_limit: "60 / 60s",
    inputs: { run_id: "UUID from start_run" },
    outputs: "Full result JSON of a succeeded run. On error: { error: { code, message, status?, progress? } }.",
    error_codes: ["not_authenticated", "not_found", "db_error", "run_running", "run_failed", "run_canceled"],
  },
  {
    name: "get_run_logs",
    title: "Get run logs",
    auth: "oauth-user",
    rate_limit: "120 / 60s",
    inputs: { run_id: "UUID from start_run" },
    outputs: "{ logs: [{ t, level, msg }], error }",
    notes: "Use this to debug a failed run.",
    error_codes: ["not_authenticated", "not_found", "db_error"],
  },
  {
    name: "cancel_run",
    title: "Cancel a simulation run",
    auth: "oauth-user",
    rate_limit: "30 / 60s",
    inputs: { run_id: "UUID from start_run" },
    outputs: "{ run_id, status, canceled: bool, canceled_at? }. No-op when the run already finished.",
    notes: "Cancels a running sensitivity sweep between combos. In-flight synchronous simulate() calls are not interrupted; the run is marked canceled and partial results persisted.",
    error_codes: ["not_authenticated", "not_found", "db_error"],
  },
  {
    name: "watchlist_updates",
    title: "Poll watchlist updates",
    auth: "oauth-user",
    rate_limit: "60 / 60s",
    inputs: {
      since: "ISO cursor from prior next_since (optional; last 24h if omitted)",
      include_dividends: "bool (default true)",
      include_quotes: "bool (default true; false = alerts-only)",
      max_symbols: "1..50 (default 25)",
      limit: "1..500 (default 100) alerts per page",
    },
    outputs: "{ next_since, cursor, since, has_more, limit, count, symbols, quotes, alerts }",
    notes: "Alerts are returned oldest→newest. Page with the same `since` while `has_more=true`, then advance to `next_since`. Uses strict `>` on created_at, so no duplicates and no gaps.",
    error_codes: ["not_authenticated", "db_error"],
  },
  {
    name: "list_tool_docs",
    title: "List tool documentation",
    auth: "public",
    rate_limit: null,
    inputs: { format: "'json' | 'markdown' | 'json-schema' (default 'markdown')" },
    outputs: "Documentation of every tool with inputs, outputs, auth, rate limits, and error codes. `json-schema` returns the full machine-readable MCP manifest (JSON Schema for every tool input).",
  },
];

function toMarkdown(): string {
  const lines: string[] = [
    "# Vela MCP tools",
    "",
    "Server: `vela` — auth: OAuth 2.1 (Supabase). Public tools work without a token; oauth-user tools operate as the signed-in Vela user under RLS.",
    "",
    "Error envelope for authenticated run/watchlist tools: `{ error: { code, message, ...extra } }`. Branch on `code`.",
    "",
  ];
  for (const d of DOCS) {
    lines.push(`## \`${d.name}\` — ${d.title}`);
    lines.push("");
    lines.push(`- **Auth scope:** ${d.auth}`);
    if (d.rate_limit) lines.push(`- **Rate limit:** ${d.rate_limit}`);
    const ins = Object.entries(d.inputs);
    if (ins.length) {
      lines.push("- **Inputs:**");
      for (const [k, v] of ins) lines.push(`  - \`${k}\` — ${v}`);
    } else {
      lines.push("- **Inputs:** none");
    }
    lines.push(`- **Output:** ${d.outputs}`);
    if (d.error_codes?.length) lines.push(`- **Error codes:** ${d.error_codes.map((c) => `\`${c}\``).join(", ")}`);
    if (d.notes) lines.push(`- **Notes:** ${d.notes}`);
    lines.push("");
  }
  return lines.join("\n");
}

// Bundled at build time: the same catalog Lovable's More → Agent integrations panel
// reads. Import-safe (pure JSON) so the entry-eval and cold-start rules hold.
import manifest from "../../../../.lovable/mcp/manifest.json" with { type: "json" };

export default defineTool({
  name: "list_tool_docs",
  title: "List tool documentation",
  description:
    "Return documentation of every tool this MCP server exposes. `format='markdown'` (default): human-readable catalog with inputs, outputs, auth, rate limits, and error codes. `format='json'`: the same catalog as structured data. `format='json-schema'`: the full machine-readable MCP manifest (JSON Schema per tool) so an external agent can auto-generate a typed client. Public — no auth required.",
  inputSchema: {
    format: z.enum(["json", "markdown", "json-schema"]).default("markdown").describe("Output format."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ format }) => {
    if (format === "json-schema") {
      const payload = manifest as unknown as Record<string, unknown>;
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    }
    if (format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify({ tools: DOCS }) }],
        structuredContent: { tools: DOCS },
      };
    }
    const md = toMarkdown();
    return {
      content: [{ type: "text", text: md }],
      structuredContent: { markdown: md, tools: DOCS },
    };
  },
});