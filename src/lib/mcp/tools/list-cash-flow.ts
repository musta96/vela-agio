import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_cash_flow",
  title: "List cash flow entries",
  description:
    "Return the signed-in user's cash flow entries (income/expense), most recent first. Optional `limit` (default 100, max 500).",
  inputSchema: {
    limit: z.number().int().positive().describe("Max entries to return (default 100, capped at 500).").optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
    }
    const capped = Math.min(500, Math.max(1, limit ?? 100));
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("cash_flow_entries")
      .select("id, entry_date, direction, category, label, amount, currency, recurring_monthly, paused_from")
      .eq("user_id", ctx.getUserId())
      .order("entry_date", { ascending: false })
      .limit(capped);
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    const entries = data ?? [];
    return {
      content: [{ type: "text", text: JSON.stringify(entries) }],
      structuredContent: { entries },
    };
  },
});