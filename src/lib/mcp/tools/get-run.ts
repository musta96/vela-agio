import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { withInstrumentation } from "../lib/instrument";

function sbUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loadRun(ctx: ToolContext, runId: string, columns: string) {
  const sb = sbUser(ctx);
  const { data, error } = await sb
    .from("simulation_runs")
    .select(columns)
    .eq("id", runId)
    .eq("user_id", ctx.getUserId())
    .maybeSingle();
  return { data, error, sb };
}

export const getRunStatus = defineTool({
  name: "get_run_status",
  title: "Get run status",
  description:
    "Return progress and status of a simulation run created with `start_run` (kind, status, progress 0-100, started/finished timestamps, error string if failed). Requires authentication; only the run owner can read it.",
  inputSchema: { run_id: z.string().uuid().describe("run_id returned by start_run") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ run_id }, ctx) =>
    withInstrumentation("get_run_status", ctx, async () => {
      if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
      const { data, error } = await loadRun(ctx, run_id, "id, kind, status, progress, error, started_at, finished_at, created_at, updated_at");
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      if (!data) return { content: [{ type: "text", text: "Run not found." }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data as Record<string, unknown> };
    }, { rateLimit: { max: 120, windowSec: 60 } }),
});

export const getRunResult = defineTool({
  name: "get_run_result",
  title: "Get run result",
  description:
    "Return the full result JSON of a completed simulation run. Errors if the run is still running or failed. Requires authentication; only the run owner can read it.",
  inputSchema: { run_id: z.string().uuid().describe("run_id returned by start_run") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ run_id }, ctx) =>
    withInstrumentation("get_run_result", ctx, async () => {
      if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
      const { data, error } = await loadRun(ctx, run_id, "id, kind, status, progress, result, error");
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      if (!data) return { content: [{ type: "text", text: "Run not found." }], isError: true };
      const row = data as { status: string; result: unknown; error: string | null };
      if (row.status !== "succeeded") {
        return {
          content: [{ type: "text", text: `Run status=${row.status}${row.error ? ` error=${row.error}` : ""}` }],
          structuredContent: data as Record<string, unknown>,
          isError: row.status === "failed",
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(row.result) }], structuredContent: data as Record<string, unknown> };
    }, { rateLimit: { max: 60, windowSec: 60 } }),
});

export const getRunLogs = defineTool({
  name: "get_run_logs",
  title: "Get run worker logs",
  description:
    "Return the worker log timeline (info/warn/error) and any error string for a simulation run. Useful for debugging failed runs. Requires authentication; only the run owner can read it.",
  inputSchema: { run_id: z.string().uuid().describe("run_id returned by start_run") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ run_id }, ctx) =>
    withInstrumentation("get_run_logs", ctx, async () => {
      if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
      const { data, error } = await loadRun(ctx, run_id, "id, kind, status, progress, error, logs, started_at, finished_at");
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      if (!data) return { content: [{ type: "text", text: "Run not found." }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data as Record<string, unknown> };
    }, { rateLimit: { max: 120, windowSec: 60 } }),
});