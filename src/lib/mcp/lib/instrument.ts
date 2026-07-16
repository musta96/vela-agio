import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

// Shared helper: rate-limit + audit-log every MCP tool call.
// - Logging always happens (fire-and-forget insert into `mcp_call_log`).
// - Rate limits are enforced only for authenticated calls, using the caller's
//   own JWT so RLS scopes the count to their rows. There is no in-memory
//   store because Supabase Edge Functions cold-start between invocations.

function supabaseFor(ctx: ToolContext) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const authed = ctx.isAuthenticated();
  return createClient(url, key, {
    global: authed ? { headers: { Authorization: `Bearer ${ctx.getToken()}` } } : {},
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface RateLimit {
  /** Max calls of this tool per window. */
  max: number;
  /** Rolling window in seconds. */
  windowSec: number;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

export async function withInstrumentation<T extends ToolResult>(
  toolName: string,
  ctx: ToolContext,
  handler: () => Promise<T>,
  opts?: { rateLimit?: RateLimit },
): Promise<T | ToolResult> {
  const start = Date.now();
  const authed = ctx.isAuthenticated();
  const userId = authed ? ctx.getUserId() : null;
  const clientId = (() => {
    try { return ctx.getClientId?.() ?? null; } catch { return null; }
  })();
  const sb = supabaseFor(ctx);

  // Rate-limit authenticated calls when requested.
  if (authed && opts?.rateLimit) {
    const since = new Date(Date.now() - opts.rateLimit.windowSec * 1000).toISOString();
    const { count, error } = await sb
      .from("mcp_call_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("tool_name", toolName)
      .gte("created_at", since);
    if (!error && (count ?? 0) >= opts.rateLimit.max) {
      const msg = `Rate limit reached: ${opts.rateLimit.max} \`${toolName}\` calls per ${opts.rateLimit.windowSec}s. Please retry shortly.`;
      // Log the throttle so it's visible in the audit trail.
      void sb.from("mcp_call_log").insert({
        user_id: userId, tool_name: toolName, ok: false,
        duration_ms: Date.now() - start, error: "rate_limited", client_id: clientId,
      });
      return { content: [{ type: "text", text: msg }], isError: true };
    }
  }

  try {
    const result = await handler();
    void sb.from("mcp_call_log").insert({
      user_id: userId,
      tool_name: toolName,
      ok: !result.isError,
      duration_ms: Date.now() - start,
      error: result.isError ? summarize(result) : null,
      client_id: clientId,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void sb.from("mcp_call_log").insert({
      user_id: userId, tool_name: toolName, ok: false,
      duration_ms: Date.now() - start, error: message.slice(0, 500), client_id: clientId,
    });
    throw err;
  }
}

function summarize(r: ToolResult): string {
  const txt = r.content?.[0]?.text ?? "";
  return txt.slice(0, 500);
}