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

// Typed error envelope. Every non-2xx response from get_run_* uses this shape
// so agents can branch on `error.code` without parsing free-text.
// Codes: not_authenticated | not_found | db_error | run_running | run_failed | run_canceled
function err(code: string, message: string, extra?: Record<string, unknown>) {
  const payload = { error: { code, message, ...(extra ?? {}) } };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: true,
  };
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
    "Return progress and status of a simulation run created with `start_run` (kind, status, progress 0-100, started/finished/canceled timestamps, error string if failed). On error returns a typed envelope `{ error: { code, message } }` with codes: not_authenticated, not_found, db_error. Requires authentication; only the run owner can read it.",
  inputSchema: { run_id: z.string().uuid().describe("run_id returned by start_run") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ run_id }, ctx) =>
    withInstrumentation("get_run_status", ctx, async () => {
      if (!ctx.isAuthenticated()) return err("not_authenticated", "Sign in to read a run.");
      const { data, error } = await loadRun(ctx, run_id, "id, kind, status, progress, error, started_at, finished_at, canceled_at, cancel_requested, created_at, updated_at");
      if (error) return err("db_error", error.message);
      if (!data) return err("not_found", `No run ${run_id} for the signed-in user.`);
      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data as unknown as Record<string, unknown> };
    }, { rateLimit: { max: 120, windowSec: 60 } }),
});

export const getRunResult = defineTool({
  name: "get_run_result",
  title: "Get run result",
  description:
    "Return the full result JSON of a completed simulation run. Errors with a typed envelope `{ error: { code, message, status?, progress? } }` when the run is not ready. Codes: not_authenticated, not_found, db_error, run_running, run_failed, run_canceled. Requires authentication; only the run owner can read it.",
  inputSchema: { run_id: z.string().uuid().describe("run_id returned by start_run") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ run_id }, ctx) =>
    withInstrumentation("get_run_result", ctx, async () => {
      if (!ctx.isAuthenticated()) return err("not_authenticated", "Sign in to read a run result.");
      const { data, error } = await loadRun(ctx, run_id, "id, kind, status, progress, result, error");
      if (error) return err("db_error", error.message);
      if (!data) return err("not_found", `No run ${run_id} for the signed-in user.`);
      const row = data as unknown as { status: string; progress: number; result: unknown; error: string | null };
      if (row.status === "running") {
        return err("run_running", `Run is still running (progress=${row.progress}%). Poll get_run_status.`, { status: row.status, progress: row.progress });
      }
      if (row.status === "failed") {
        return err("run_failed", row.error ?? "Run failed without an error message.", { status: row.status, progress: row.progress, worker_error: row.error });
      }
      if (row.status === "canceled") {
        return err("run_canceled", "Run was canceled before completion.", { status: row.status, progress: row.progress });
      }
      return { content: [{ type: "text", text: JSON.stringify(row.result) }], structuredContent: data as unknown as Record<string, unknown> };
    }, { rateLimit: { max: 60, windowSec: 60 } }),
});

export const getRunLogs = defineTool({
  name: "get_run_logs",
  title: "Get run worker logs",
  description:
    "Return the worker log timeline (info/warn/error) and any error string for a simulation run. Useful for debugging failed runs. On error returns a typed envelope `{ error: { code, message } }` with codes: not_authenticated, not_found, db_error. Requires authentication; only the run owner can read it.",
  inputSchema: { run_id: z.string().uuid().describe("run_id returned by start_run") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ run_id }, ctx) =>
    withInstrumentation("get_run_logs", ctx, async () => {
      if (!ctx.isAuthenticated()) return err("not_authenticated", "Sign in to read run logs.");
      const { data, error } = await loadRun(ctx, run_id, "id, kind, status, progress, error, logs, started_at, finished_at, canceled_at");
      if (error) return err("db_error", error.message);
      if (!data) return err("not_found", `No run ${run_id} for the signed-in user.`);
      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data as unknown as Record<string, unknown> };
    }, { rateLimit: { max: 120, windowSec: 60 } }),
});