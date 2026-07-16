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

// Structured error envelope shared with get-run tools.
function err(code: string, message: string, extra?: Record<string, unknown>) {
  const payload = { error: { code, message, ...(extra ?? {}) } };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: true,
  };
}

export default defineTool({
  name: "cancel_run",
  title: "Cancel a simulation run",
  description:
    "Request cancellation of an in-flight backtest or sensitivity run started with `start_run`. " +
    "Sets `cancel_requested=true` on the run; the worker checks the flag between iterations and stops cleanly, " +
    "writing `status='canceled'`. If the run is already `succeeded`, `failed`, or `canceled`, the call is a no-op. " +
    "Requires authentication; only the run owner can cancel.",
  inputSchema: {
    run_id: z.string().uuid().describe("run_id returned by start_run"),
  },
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ run_id }, ctx: ToolContext) =>
    withInstrumentation("cancel_run", ctx, async () => {
      if (!ctx.isAuthenticated()) return err("not_authenticated", "Sign in to cancel a run.");
      const sb = sbUser(ctx);
      const uid = ctx.getUserId();

      const { data: row, error: readErr } = await sb
        .from("simulation_runs")
        .select("id, status, cancel_requested")
        .eq("id", run_id)
        .eq("user_id", uid)
        .maybeSingle();
      if (readErr) return err("db_error", readErr.message);
      if (!row) return err("not_found", `No run ${run_id} for the signed-in user.`);

      if (row.status !== "running") {
        const payload = {
          run_id, status: row.status, canceled: false,
          reason: `run is already ${row.status}; nothing to cancel`,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(payload) }],
          structuredContent: payload,
        };
      }

      const nowIso = new Date().toISOString();
      // Optimistic: mark cancel_requested + flip status so pollers see it immediately.
      // The worker loop clears/sets fields on exit.
      const { error: updErr } = await sb
        .from("simulation_runs")
        .update({ cancel_requested: true, status: "canceled", canceled_at: nowIso, finished_at: nowIso })
        .eq("id", run_id)
        .eq("user_id", uid)
        .eq("status", "running");
      if (updErr) return err("db_error", updErr.message);

      const payload = { run_id, status: "canceled", canceled: true, canceled_at: nowIso };
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    }, { rateLimit: { max: 30, windowSec: 60 } }),
});
