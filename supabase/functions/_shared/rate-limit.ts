// Shared rate limiting for public (unauthenticated or semi-public) edge functions.
//
// Backed by public.edge_rate_limits + public.consume_rate_limit(), which are
// service-role only — clients cannot read, reset or bypass the counters.
import { createClient } from "npm:@supabase/supabase-js@2";

let cached: ReturnType<typeof createClient> | null = null;
function serviceClient() {
  if (!cached) {
    cached = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return cached;
}

/** Best-effort caller identity: real client IP behind the edge proxy. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return (
    fwd.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export interface RateLimitOptions {
  /** Logical name of the protected endpoint, e.g. "validate-promo-code". */
  scope: string;
  /** Identity to bucket on — defaults to the caller IP. */
  identity?: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Returns null when the call may proceed, or a ready-to-return 429 Response.
 * Fails open on infrastructure errors so a database blip cannot take checkout
 * or lead capture offline — the counter is a spam guard, not an authz control.
 */
export async function rateLimit(
  req: Request,
  opts: RateLimitOptions,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const identity = opts.identity ?? clientIp(req);
  try {
    const { data, error } = await serviceClient().rpc("consume_rate_limit", {
      _key: `${opts.scope}:${identity}`,
      _limit: opts.limit,
      _window_seconds: opts.windowSeconds,
    });
    if (error) {
      console.warn("[rate-limit] check failed", opts.scope, error.message);
      return null;
    }
    if (data === false) {
      console.warn("[rate-limit] blocked", opts.scope, identity);
      return new Response(
        JSON.stringify({ error: "Too many requests. Please wait a moment and try again." }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(opts.windowSeconds),
          },
        },
      );
    }
  } catch (e) {
    console.warn("[rate-limit] unavailable", opts.scope, (e as Error).message);
  }
  return null;
}

/** Validates the caller's JWT and returns the user id, or null when absent/invalid. */
export async function requireUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data } = await client.auth.getClaims(authHeader.replace("Bearer ", ""));
    return (data?.claims?.sub as string | undefined) ?? null;
  } catch {
    return null;
  }
}
