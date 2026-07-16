import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

// Human-readable catalog of every tool exposed by this MCP server.
// The MCP `tools/list` protocol call already returns machine schemas; this tool
// gives external agents a compact markdown/JSON description including auth
// scope, rate limits, and usage notes.

// Semver of the tool catalog + JSON-schema manifest. Bump on any breaking
// change to a tool's input/output shape or an error.code contract; bump the
// minor for additive changes. External agents can pin against this to detect
// incompatible updates before invoking a tool.
const MANIFEST_VERSION = "1.2.0";

// Human-readable change log, newest first. Keep entries short (one line per
// change) and reference the affected tool by name.
const CHANGELOG: Array<{ version: string; date: string; changes: string[] }> = [
  {
    version: "1.2.0",
    date: "2026-07-16",
    changes: [
      "docs: added copy/paste `curl` examples for start_run, get_run_status, get_run_result, get_run_logs, cancel_run, watchlist_updates.",
      "docs: exposed `manifest_version` and `changelog` on json/json-schema/markdown outputs so agents can detect breaking schema updates.",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-07-16",
    changes: [
      "feat: `cancel_run` tool to stop an in-flight sensitivity sweep.",
      "feat: typed `{ error: { code, message, ...extra } }` envelopes on get_run_status/get_run_result/get_run_logs/cancel_run/watchlist_updates.",
      "feat: `watchlist_updates` now returns `next_since`, `cursor`, `has_more`, `count`; added `include_quotes` toggle.",
      "feat: `list_tool_docs` accepts `format='json-schema'` and embeds `examples` on every tool.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-16",
    changes: [
      "feat: initial MCP tool surface — quotes, dividends, watchlist, portfolio, net worth, cash flow, run_backtest, start_run, get_run_status, get_run_result, get_run_logs.",
    ],
  },
];

// The Supabase project ref is inlined by Vite at build time; the emitted MCP
// Edge Function lives at `https://<ref>.supabase.co/functions/v1/mcp`.
// Fallback keeps the curl template well-formed during the throwaway
// manifest-extract eval when env is not populated.
const PROJECT_REF =
  (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_PROJECT_ID) ||
  "<project-ref>";
const MCP_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/mcp`;

function curlFor(toolName: string, args: Record<string, unknown>): string {
  // MCP JSON-RPC 2.0 `tools/call` envelope. External agents can replace
  // <ACCESS_TOKEN> with the OAuth bearer token obtained from Supabase Auth.
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  };
  const json = JSON.stringify(body);
  // Escape single quotes for safe embedding inside a bash single-quoted string.
  const safe = json.replace(/'/g, "'\\''");
  return [
    `curl -sS -X POST '${MCP_URL}' \\`,
    `  -H 'Authorization: Bearer <ACCESS_TOKEN>' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -H 'Accept: application/json' \\`,
    `  -d '${safe}'`,
  ].join("\n");
}

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

// Copy/paste-ready examples for the run + watchlist tools. Each entry has a
// realistic request payload, a bash `curl` snippet with the required auth +
// content-type headers, and — where applicable — a set of typed error
// responses keyed by `error.code`, matching the envelope the handlers return.
interface ToolExample {
  request: { name: string; arguments: Record<string, unknown> };
  curl?: string;
  success_response?: Record<string, unknown>;
  error_responses?: Record<string, { error: { code: string; message: string; [k: string]: unknown } }>;
}

const EXAMPLES: Record<string, ToolExample> = {
  start_run: {
    request: {
      name: "start_run",
      arguments: {
        kind: "sensitivity",
        input: {
          symbol: "AAPL",
          preset: "sma_cross",
          range: "5y",
          initial_capital: 10000,
          sweep: { fast: [10, 20, 50], slow: [100, 150, 200] },
        },
      },
    },
    curl: curlFor("start_run", {
      kind: "sensitivity",
      input: {
        symbol: "AAPL",
        preset: "sma_cross",
        range: "5y",
        initial_capital: 10000,
        sweep: { fast: [10, 20, 50], slow: [100, 150, 200] },
      },
    }),
    success_response: {
      run_id: "3e3a9f7c-2b1d-4e8a-9c11-8f5a6d0b1234",
      status: "running",
    },
  },
  get_run_status: {
    request: {
      name: "get_run_status",
      arguments: { run_id: "3e3a9f7c-2b1d-4e8a-9c11-8f5a6d0b1234" },
    },
    curl: curlFor("get_run_status", { run_id: "<RUN_ID>" }),
    success_response: {
      id: "3e3a9f7c-2b1d-4e8a-9c11-8f5a6d0b1234",
      kind: "sensitivity",
      status: "running",
      progress: 42,
      error: null,
      started_at: "2026-07-16T14:33:09Z",
      finished_at: null,
      canceled_at: null,
      cancel_requested: false,
    },
    error_responses: {
      not_authenticated: { error: { code: "not_authenticated", message: "Sign in to read a run." } },
      not_found: {
        error: { code: "not_found", message: "No run 3e3a9f7c-2b1d-4e8a-9c11-8f5a6d0b1234 for the signed-in user." },
      },
      db_error: { error: { code: "db_error", message: "permission denied for table simulation_runs" } },
    },
  },
  get_run_result: {
    request: {
      name: "get_run_result",
      arguments: { run_id: "3e3a9f7c-2b1d-4e8a-9c11-8f5a6d0b1234" },
    },
    curl: curlFor("get_run_result", { run_id: "<RUN_ID>" }),
    success_response: {
      metrics: { cagr: 0.128, maxDrawdown: -0.213, sharpe: 1.14, hitRate: 0.56 },
      combos: 9,
    },
    error_responses: {
      run_running: {
        error: {
          code: "run_running",
          message: "Run is still running (progress=42%). Poll get_run_status.",
          status: "running",
          progress: 42,
        },
      },
      run_failed: {
        error: {
          code: "run_failed",
          message: "Yahoo history fetch returned 0 bars",
          status: "failed",
          progress: 15,
          worker_error: "Yahoo history fetch returned 0 bars",
        },
      },
      run_canceled: {
        error: {
          code: "run_canceled",
          message: "Run was canceled before completion.",
          status: "canceled",
          progress: 33,
        },
      },
      not_found: {
        error: { code: "not_found", message: "No run 3e3a9f7c-2b1d-4e8a-9c11-8f5a6d0b1234 for the signed-in user." },
      },
      not_authenticated: { error: { code: "not_authenticated", message: "Sign in to read a run result." } },
    },
  },
  get_run_logs: {
    request: {
      name: "get_run_logs",
      arguments: { run_id: "3e3a9f7c-2b1d-4e8a-9c11-8f5a6d0b1234" },
    },
    curl: curlFor("get_run_logs", { run_id: "<RUN_ID>" }),
    success_response: {
      id: "3e3a9f7c-2b1d-4e8a-9c11-8f5a6d0b1234",
      kind: "sensitivity",
      status: "failed",
      progress: 15,
      error: "Yahoo history fetch returned 0 bars",
      logs: [
        { t: "2026-07-16T14:33:09.120Z", level: "info", msg: "sweep start (9 combos)" },
        { t: "2026-07-16T14:33:10.842Z", level: "warn", msg: "combo 2/9: thin data" },
        { t: "2026-07-16T14:33:12.005Z", level: "error", msg: "Yahoo history fetch returned 0 bars" },
      ],
      started_at: "2026-07-16T14:33:09Z",
      finished_at: "2026-07-16T14:33:12Z",
      canceled_at: null,
    },
    error_responses: {
      not_authenticated: { error: { code: "not_authenticated", message: "Sign in to read run logs." } },
      not_found: {
        error: { code: "not_found", message: "No run 3e3a9f7c-2b1d-4e8a-9c11-8f5a6d0b1234 for the signed-in user." },
      },
      db_error: { error: { code: "db_error", message: "permission denied for table simulation_runs" } },
    },
  },
  cancel_run: {
    request: {
      name: "cancel_run",
      arguments: { run_id: "3e3a9f7c-2b1d-4e8a-9c11-8f5a6d0b1234" },
    },
    curl: curlFor("cancel_run", { run_id: "<RUN_ID>" }),
    success_response: {
      run_id: "3e3a9f7c-2b1d-4e8a-9c11-8f5a6d0b1234",
      status: "canceled",
      canceled: true,
      canceled_at: "2026-07-16T14:34:01Z",
    },
    error_responses: {
      not_authenticated: { error: { code: "not_authenticated", message: "Sign in to cancel a run." } },
      not_found: {
        error: { code: "not_found", message: "No run 3e3a9f7c-2b1d-4e8a-9c11-8f5a6d0b1234 for the signed-in user." },
      },
      db_error: { error: { code: "db_error", message: "update failed: row locked" } },
    },
  },
  watchlist_updates: {
    request: {
      name: "watchlist_updates",
      arguments: {
        since: "2026-07-16T14:00:00Z",
        include_dividends: true,
        include_quotes: true,
        max_symbols: 25,
        limit: 100,
      },
    },
    curl: curlFor("watchlist_updates", {
      since: "<ISO8601_CURSOR>",
      include_dividends: true,
      include_quotes: true,
      max_symbols: 25,
      limit: 100,
    }),
    success_response: {
      next_since: "2026-07-16T14:33:12.005Z",
      cursor: "2026-07-16T14:33:12.005Z",
      since: "2026-07-16T14:00:00Z",
      has_more: false,
      limit: 100,
      count: 2,
      symbols: ["AAPL", "MSFT"],
      quotes: [
        { symbol: "AAPL", price: 231.42, change_pct: 0.0081, as_of: "2026-07-16T14:33:00Z" },
        { symbol: "MSFT", price: 512.10, change_pct: -0.0023, as_of: "2026-07-16T14:33:00Z" },
      ],
      alerts: [
        {
          id: "a1c2…",
          symbol: "AAPL",
          kind: "spread_delta",
          value: 1.8,
          created_at: "2026-07-16T14:12:44Z",
        },
        {
          id: "b2d3…",
          symbol: "MSFT",
          kind: "dividend",
          value: 0.83,
          created_at: "2026-07-16T14:33:12.005Z",
        },
      ],
    },
    error_responses: {
      not_authenticated: { error: { code: "not_authenticated", message: "Sign in to poll watchlist updates." } },
      db_error: { error: { code: "db_error", message: "permission denied for table alerts" } },
    },
  },
};

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
    const ex = EXAMPLES[d.name];
    if (ex) {
      lines.push("- **Example request:**");
      lines.push("");
      lines.push("  ```json");
      for (const l of JSON.stringify(ex.request, null, 2).split("\n")) lines.push(`  ${l}`);
      lines.push("  ```");
      if (ex.success_response) {
        lines.push("- **Example success response:**");
        lines.push("");
        lines.push("  ```json");
        for (const l of JSON.stringify(ex.success_response, null, 2).split("\n")) lines.push(`  ${l}`);
        lines.push("  ```");
      }
      if (ex.error_responses) {
        lines.push("- **Example error responses:**");
        for (const [code, body] of Object.entries(ex.error_responses)) {
          lines.push(`  - \`${code}\`:`);
          lines.push("");
          lines.push("    ```json");
          for (const l of JSON.stringify(body, null, 2).split("\n")) lines.push(`    ${l}`);
          lines.push("    ```");
        }
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

// Bundled at build time: the same catalog Lovable's More → Agent integrations panel
// reads. Import-safe (pure JSON) so the entry-eval and cold-start rules hold.
import manifest from "../../../../.lovable/mcp/manifest.json";

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
      // Enrich the bundled manifest with copy/paste-ready examples and typed
      // error envelopes so external agents can generate working clients from a
      // single JSON artifact.
      const base = manifest as unknown as { mcp?: { tools?: Array<Record<string, unknown>> } };
      const enriched = JSON.parse(JSON.stringify(base)) as typeof base;
      const tools = enriched.mcp?.tools ?? [];
      for (const t of tools) {
        const ex = EXAMPLES[(t as { name: string }).name];
        if (ex) (t as Record<string, unknown>).examples = ex;
      }
      const payload = enriched as unknown as Record<string, unknown>;
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    }
    if (format === "json") {
      const merged = DOCS.map((d) => ({ ...d, examples: EXAMPLES[d.name] ?? null }));
      return {
        content: [{ type: "text", text: JSON.stringify({ tools: merged }) }],
        structuredContent: { tools: merged },
      };
    }
    const md = toMarkdown();
    return {
      content: [{ type: "text", text: md }],
      structuredContent: { markdown: md, tools: DOCS, examples: EXAMPLES },
    };
  },
});