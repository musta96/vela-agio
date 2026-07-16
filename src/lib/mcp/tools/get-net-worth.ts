import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { withInstrumentation } from "../lib/instrument";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_net_worth",
  title: "Get net worth summary",
  description:
    "Return the signed-in Vela user's net-worth accounts with totals for assets, liabilities and net. Values are in each account's stored currency (no FX conversion).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) =>
    withInstrumentation("get_net_worth", ctx, async () => {
      if (!ctx.isAuthenticated()) {
        return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
      }
      const sb = supabaseForUser(ctx);
      const { data, error } = await sb
        .from("net_worth_accounts")
        .select("id, name, category, subcategory, currency, manual_value, is_liability, include_in_total")
        .eq("user_id", ctx.getUserId());
      if (error) {
        return { content: [{ type: "text", text: error.message }], isError: true };
      }
      const accounts = data ?? [];
      let assets = 0;
      let liabilities = 0;
      for (const a of accounts) {
        if (!a.include_in_total) continue;
        const v = Number(a.manual_value) || 0;
        if (a.is_liability) liabilities += Math.abs(v);
        else assets += v;
      }
      const summary = { assets, liabilities, net: assets - liabilities, currency_note: "Values are per-account; no FX conversion applied." };
      return {
        content: [{ type: "text", text: JSON.stringify({ summary, accounts }) }],
        structuredContent: { summary, accounts },
      };
    }, { rateLimit: { max: 60, windowSec: 60 } }),
});