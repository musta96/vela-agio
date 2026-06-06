// P8 #43-45: credit-based metering + analysis cache helpers.
// Each AI feature declares its credit cost; cache lookups short-circuit
// compute and metering for repeated (ticker, day, type) requests.

import { createClient } from "npm:@supabase/supabase-js@2";

export type AiFeature =
  | "chat_turn"
  | "sentiment"
  | "news_triage"
  | "smart_pick"
  | "research_report"
  | "deep_analysis"
  | "dcf_model"
  | "portfolio_doctor"
  | "backtest"
  | "market_briefing";

/** True compute cost (rough proxy: tokens × premium-model price). */
export const FEATURE_CREDITS: Record<AiFeature, number> = {
  chat_turn: 1,
  sentiment: 2,
  news_triage: 2,
  smart_pick: 3,
  market_briefing: 4,
  portfolio_doctor: 6,
  research_report: 10,
  backtest: 12,
  deep_analysis: 18,
  dcf_model: 20,
};

export function creditsFor(feature: AiFeature, extra = 0): number {
  return (FEATURE_CREDITS[feature] ?? 1) + Math.max(0, extra);
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------- Output cache (P8 #44) ----------

function cacheKey(ticker: string, day: string, type: string, model?: string) {
  return `${type}:${ticker.toUpperCase()}:${day}${model ? `:${model}` : ""}`;
}

export async function getCachedAnalysis<T = unknown>(
  ticker: string,
  analysisType: string,
  model?: string,
): Promise<{ payload: T; cached_at: string } | null> {
  const day = new Date().toISOString().slice(0, 10);
  const key = cacheKey(ticker, day, analysisType, model);
  const { data } = await admin()
    .from("ai_output_cache")
    .select("payload, created_at, expires_at")
    .eq("cache_key", key)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return { payload: data.payload as T, cached_at: data.created_at };
}

export async function setCachedAnalysis(
  ticker: string,
  analysisType: string,
  payload: unknown,
  model?: string,
  ttlHours = 24,
): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const key = cacheKey(ticker, day, analysisType, model);
  const expires_at = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
  await admin().from("ai_output_cache").upsert(
    { cache_key: key, ticker: ticker.toUpperCase(), day, analysis_type: analysisType, model: model ?? null, payload, expires_at },
    { onConflict: "cache_key" },
  );
}

// ---------- Credit gate (P8 #43) ----------

export interface CreditCheck {
  allowed: boolean;
  used: number;
  cap: number;
  feature: AiFeature;
  cost: number;
  reason?: string;
  byo?: boolean;
}

/**
 * Check whether the user has enough credits for `feature`.
 * BYO-key users (provider !== 'lovable') are unmetered — pass byo:true.
 */
export async function checkCredits(
  userId: string | undefined,
  feature: AiFeature,
  cap: number,
  byo = false,
): Promise<CreditCheck> {
  const cost = creditsFor(feature);
  if (byo) return { allowed: true, used: 0, cap: -1, feature, cost, byo: true };
  if (!userId) return { allowed: false, used: 0, cap, feature, cost, reason: "Sign in required" };
  if (cap <= 0) return { allowed: false, used: 0, cap, feature, cost, reason: "Your plan does not include AI credits." };
  const { data } = await admin().rpc("ai_credits_this_month", { _user_id: userId });
  const used = Number(data ?? 0);
  if (used + cost > cap) {
    return {
      allowed: false, used, cap, feature, cost,
      reason: `Not enough credits (${used}/${cap}). This action costs ${cost}. Upgrade or add a BYO key.`,
    };
  }
  return { allowed: true, used, cap, feature, cost };
}

/** Build a 402 response when credits are insufficient. */
export function creditsDeniedResponse(check: CreditCheck, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({
    error: "ai_credit_limit",
    reason: check.reason,
    feature: check.feature,
    cost: check.cost,
    creditsUsed: check.used,
    creditsCap: check.cap,
    upgrade_url: "/pricing",
    byo_url: "/settings#ai",
  }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}