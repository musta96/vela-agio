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
  name: "add_cash_flow_entry",
  title: "Add cash flow entry",
  description:
    "Record an income or expense for the signed-in user. Use `recurring_monthly: true` for fixed monthly bills or salary — Vela will project it forward automatically.",
  inputSchema: {
    direction: z.enum(["income", "expense"]).describe("Whether this is income or an expense."),
    category: z.string().describe("Category label (e.g. Salary, Housing, Food, Subscriptions)."),
    amount: z.number().positive().describe("Positive amount in the entry's currency."),
    entry_date: z.string().describe("Date in YYYY-MM-DD; defaults to today when omitted.").optional(),
    currency: z.string().describe("3-letter currency code (default EUR).").optional(),
    label: z.string().describe("Optional short note, e.g. 'Rent', 'Employer'.").optional(),
    recurring_monthly: z.boolean().describe("True if this repeats every month.").optional(),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (args, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const payload = {
      user_id: ctx.getUserId(),
      direction: args.direction,
      category: args.category,
      amount: args.amount,
      entry_date: args.entry_date ?? new Date().toISOString().slice(0, 10),
      currency: (args.currency ?? "EUR").toUpperCase(),
      label: args.label ?? null,
      recurring_monthly: args.recurring_monthly ?? false,
    };
    const { data, error } = await sb.from("cash_flow_entries").insert(payload).select().single();
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: `Recorded ${args.direction} of ${args.amount} ${payload.currency} in ${args.category}.` }],
      structuredContent: { entry: data },
    };
  },
});