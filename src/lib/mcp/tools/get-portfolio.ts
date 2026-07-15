import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_portfolio",
  title: "Get portfolio",
  description: "Return the signed-in Vela user's portfolio holdings (symbol, shares, avg price, currency).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("portfolio_holdings")
      .select("symbol, name, shares, avg_price, currency")
      .eq("user_id", ctx.getUserId());
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    const holdings = data ?? [];
    return {
      content: [{ type: "text", text: JSON.stringify(holdings) }],
      structuredContent: { holdings },
    };
  },
});