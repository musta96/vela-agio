// Unified AI access resolver.
//
// For each AI feature request we need to know:
//   1. Is the user allowed to use AI?
//   2. Are we paying for it (Lovable AI) or are they (BYO key)?
//   3. What model tier are they capped at?
//
// Precedence (highest first):
//   - BYO key (always allowed, no quota)
//   - Global beta override (admin toggle in Owner Console)
//   - Active paid subscription (Plus / Pro / Elite)
//   - Otherwise: denied (free users get the helper-bot fallback)

import { createClient } from "npm:@supabase/supabase-js@2";

export type ModelCap = "none" | "flash" | "mid" | "premium";
export type AccessSource = "byo" | "beta" | "paid" | "none" | "opt_out";

export interface AiAccess {
  allowed: boolean;
  source: AccessSource;
  tier: string;             // 'free' | 'plus' | 'pro' | 'elite' | 'beta' | 'byo'
  modelCap: ModelCap;
  reason?: string;          // human-readable denial reason
  quotaUsed?: number;
  quotaLimit?: number;      // -1 = unlimited, 0 = none
  byoProvider?: string;     // 'OPENAI_API_KEY' | ...
  userId?: string;
}

const MODEL_BY_CAP: Record<ModelCap, string> = {
  none: "google/gemini-2.5-flash-lite",
  flash: "google/gemini-2.5-flash",
  mid: "openai/gpt-5-mini",
  premium: "openai/gpt-5",
};

const CAP_ORDER: ModelCap[] = ["none", "flash", "mid", "premium"];
function capMin(a: ModelCap, b: ModelCap): ModelCap {
  return CAP_ORDER.indexOf(a) < CAP_ORDER.indexOf(b) ? a : b;
}

export function modelForCap(cap: ModelCap, requested?: string): string {
  // If the caller asked for a specific model, honour it only if it's <= cap.
  // For simplicity we always return the cap-default unless cap is premium.
  if (cap === "premium" && requested) return requested;
  return MODEL_BY_CAP[cap] ?? MODEL_BY_CAP.flash;
}

/** Resolve effective AI access for the caller. Never throws — returns denied on errors. */
export async function resolveAiAccess(authHeader: string | null): Promise<AiAccess> {
  const denied: AiAccess = {
    allowed: false, source: "none", tier: "free", modelCap: "none",
    reason: "AI is a paid feature. Upgrade or add your own API key in Settings.",
  };
  try {
    if (!authHeader?.startsWith("Bearer ")) return denied;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return denied;

    const admin = createClient(SUPABASE_URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ---- 0) Honour the user's AI opt-out (Privacy settings). Hard block.
    const { data: prof } = await admin
      .from("profiles")
      .select("ai_opt_out, ai_provider")
      .eq("user_id", user.id)
      .maybeSingle();
    if (prof?.ai_opt_out) {
      return {
        allowed: false,
        source: "opt_out",
        tier: "free",
        modelCap: "none",
        reason: "You have disabled AI features for your account in Privacy settings. Re-enable them to use the Copilot.",
        userId: user.id,
      };
    }

    // ---- 1) BYO key: use only the provider the user picked in Connections.
    const PROVIDER_TO_KEY: Record<string, string> = {
      openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY",
      openrouter: "OPENROUTER_API_KEY", perplexity: "PERPLEXITY_API_KEY",
      mistral: "MISTRAL_API_KEY", groq: "GROQ_API_KEY",
    };
    const selectedProvider = prof?.ai_provider as string | undefined;
    const preferredKey = selectedProvider ? PROVIDER_TO_KEY[selectedProvider] : null;
    if (selectedProvider && selectedProvider !== "lovable" && !preferredKey) {
      return { ...denied, userId: user.id, reason: `Unsupported AI provider: ${selectedProvider}. Choose a supported provider in Settings → Connections.` };
    }
    if (preferredKey) {
      const { data } = await admin
        .from("user_api_keys")
        .select("provider")
        .eq("user_id", user.id)
        .eq("provider", preferredKey)
        .maybeSingle();
      if (!data?.provider) {
        return { ...denied, userId: user.id, reason: `Selected AI provider ${selectedProvider} needs ${preferredKey}. Add it in Settings → Connections, or switch back to Lovable AI.` };
      }
      return {
        allowed: true, source: "byo", tier: "byo", modelCap: "premium",
        byoProvider: data.provider, userId: user.id,
      };
    }

    // ---- 2) Beta override: global owner toggle
    const { data: ctrl } = await admin
      .from("platform_controls")
      .select("enabled, value")
      .eq("key", "ai_beta_override")
      .maybeSingle();
    if (ctrl?.enabled) {
      const cap = ((ctrl.value as any)?.model_cap ?? "flash") as ModelCap;
      return { allowed: true, source: "beta", tier: "beta", modelCap: cap, userId: user.id };
    }

    // ---- 3) Paid subscription
    const env = (Deno.env.get("STRIPE_ENVIRONMENT") ?? "sandbox") as string;
    const { data: sub } = await admin
      .from("subscriptions")
      .select("price_id, status, current_period_end")
      .eq("user_id", user.id)
      .eq("environment", env)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const active = !!sub && (
      ((sub.status === "active" || sub.status === "trialing" || sub.status === "past_due") &&
        (!sub.current_period_end || new Date(sub.current_period_end) > new Date()))
      || (sub.status === "canceled" && sub.current_period_end && new Date(sub.current_period_end) > new Date())
    );

    const { data: appleTester } = await admin.from("apple_test_accounts").select("user_id").eq("user_id", user.id).maybeSingle();
    const { data: appleSub, error: appleError } = await admin
      .from("apple_subscriptions").select("plan_slug")
      .eq("user_id", user.id).in("environment", appleTester ? ["live", "sandbox"] : ["live"]).eq("gives_access", true)
      .gt("expires_at", new Date().toISOString()).limit(1).maybeSingle();
    if (appleError) return denied;

    if ((active && sub) || appleSub) {
      // Find the plan that matches this price_id (or fall back by tier name embedded in price_id).
      const { data: stripePlan } = active && sub ? await admin
        .from("subscription_plans")
        .select("tier, ai_model_tier, ai_monthly_quota")
        .or(`stripe_monthly_price_id.eq.${sub.price_id},stripe_yearly_price_id.eq.${sub.price_id}`)
        .maybeSingle() : { data: null };
      const { data: applePlan } = appleSub ? await admin.from("subscription_plans")
        .select("tier, ai_model_tier, ai_monthly_quota").eq("slug", appleSub.plan_slug).maybeSingle() : { data: null };
      // Higher paid plan wins; Apple Pro never downgrades Enterprise or legacy Elite.
      const ranks: Record<string, number> = { plus: 1, pro: 2, elite: 3, enterprise: 4 };
      const plan = applePlan && (!stripePlan || (ranks[applePlan.tier] ?? 0) > (ranks[stripePlan.tier] ?? 0)) ? applePlan : stripePlan;

      let cap: ModelCap = "flash";
      let quotaLimit = 500;
      let tier = "plus";
      if (plan) {
        cap = (plan.ai_model_tier as ModelCap) ?? "flash";
        quotaLimit = plan.ai_monthly_quota ?? 500;
        tier = plan.tier ?? "plus";
      } else if (sub && typeof sub.price_id === "string") {
        // Heuristic fallback from price_id naming (e.g. "elite_monthly")
        if (sub.price_id.includes("elite")) { cap = "premium"; quotaLimit = 10000; tier = "elite"; }
        else if (sub.price_id.includes("pro")) { cap = "mid"; quotaLimit = 2000; tier = "pro"; }
      }

      // Quota check
      if (cap === "none" || quotaLimit === 0) {
        return { ...denied, tier, reason: "Your plan does not include Lovable AI. Upgrade or add a BYO key." };
      }
      let used = 0;
      if (quotaLimit > 0) {
        const { data: usageRow } = await admin.rpc("ai_usage_this_month", { _user_id: user.id });
        used = (usageRow as number) ?? 0;
        if (used >= quotaLimit) {
          return {
            ...denied, tier, modelCap: cap, quotaUsed: used, quotaLimit,
            reason: `Monthly AI quota reached (${used}/${quotaLimit}). Upgrade or add your own API key.`,
          };
        }
      }

      return {
        allowed: true, source: "paid", tier, modelCap: cap,
        quotaUsed: used, quotaLimit, userId: user.id,
      };
    }

    return denied;
  } catch (e) {
    console.error("resolveAiAccess failed", e);
    return denied;
  }
}

/** Log a single AI request (best-effort; never throws). */
export async function logAiUsage(args: {
  userId?: string;
  feature: string;
  model?: string;
  provider?: "lovable" | "byo";
  tokensIn?: number;
  tokensOut?: number;
  success?: boolean;
  credits?: number;
  cacheHit?: boolean;
  costCents?: number;
}): Promise<void> {
  if (!args.userId) return;
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await admin.from("ai_usage_log").insert({
      user_id: args.userId,
      feature: args.feature,
      model: args.model ?? null,
      provider: args.provider ?? "lovable",
      tokens_in: args.tokensIn ?? 0,
      tokens_out: args.tokensOut ?? 0,
      success: args.success !== false,
      credits: args.credits ?? 1,
      cache_hit: args.cacheHit ?? false,
      cost_cents: args.costCents ?? 0,
    });
  } catch (e) {
    console.warn("logAiUsage failed", e);
  }
}

/** Helper to build a 402 JSON response when access is denied. */
export function aiDeniedResponse(access: AiAccess, corsHeaders: Record<string, string>): Response {
  const status = access.source === "opt_out" ? 403 : 402;
  return new Response(
    JSON.stringify({
      error: access.source === "opt_out" ? "ai_opt_out" : "ai_access_denied",
      reason: access.reason ?? "AI is a paid feature.",
      tier: access.tier,
      quotaUsed: access.quotaUsed,
      quotaLimit: access.quotaLimit,
      upgrade_url: "/pricing",
      byo_url: "/settings?tab=Connections",
      opt_out_url: access.source === "opt_out" ? "/privacy-settings" : undefined,
    }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}