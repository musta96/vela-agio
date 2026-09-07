/**
 * `supabase.functions.invoke` collapses any 4xx/5xx into a generic
 * "Edge Function returned a non-2xx status code" and hides the JSON body.
 * Our functions answer entitlement problems with structured payloads
 * (`{ error, reason, upgrade_url, byo_url }`), so we read the response back
 * off the error and turn it into something a person can act on.
 */
export interface EdgeErrorInfo {
  code: string | null;
  message: string;
  status: number | null;
  upgradeUrl: string | null;
  byoUrl: string | null;
  /** True for plan/credit gating (402/403) rather than a real failure. */
  isEntitlement: boolean;
}

const FRIENDLY: Record<string, string> = {
  ai_access_denied: "AI insights are part of the paid plans. Upgrade, or add your own API key in Settings → Connections.",
  ai_credit_limit: "You've used all the AI credits included in your plan this month.",
  ai_opt_out: "AI features are switched off for your account in Settings → Privacy.",
  rate_limited: "Too many requests in a short time. Wait a moment and try again.",
};

export async function readEdgeError(err: unknown): Promise<EdgeErrorInfo> {
  const anyErr = err as { message?: string; context?: Response };
  let body: Record<string, unknown> | null = null;
  let status: number | null = null;

  const res = anyErr?.context;
  if (res && typeof (res as Response).status === "number") {
    status = (res as Response).status;
    try {
      body = await (res as Response).clone().json();
    } catch {
      /* non-JSON body */
    }
  }

  const code = typeof body?.error === "string" ? (body.error as string) : null;
  const reason = typeof body?.reason === "string" ? (body.reason as string) : null;
  const message =
    (code && FRIENDLY[code]) ||
    reason ||
    (code && code !== "error" ? code : null) ||
    anyErr?.message ||
    "Something went wrong. Try again later.";

  return {
    code,
    message,
    status,
    upgradeUrl: typeof body?.upgrade_url === "string" ? (body.upgrade_url as string) : null,
    byoUrl: typeof body?.byo_url === "string" ? (body.byo_url as string) : null,
    isEntitlement: status === 402 || status === 403 || code === "ai_access_denied" || code === "ai_credit_limit",
  };
}
