import { supabase } from "@/integrations/supabase/client";

/**
 * Signup + onboarding funnel analytics.
 *
 * Events are logged to `ai_event_log` under `feature = "signup_funnel"` or
 * `feature = "onboarding"` so we can measure whether users:
 *   1) start the free-trial signup,
 *   2) reach the card step,
 *   3) successfully validate a card,
 *   4) finish onboarding within the 30-second goal, and
 *   5) take a first core action.
 */
export type SignupEvent =
  | "trial_signup_started"
  | "trial_signup_step_view"      // step 1 | 2 | 3
  | "trial_signup_card_submitted" // card iframe opened
  | "trial_signup_completed"      // finalize-trial-signup ok
  | "trial_signup_failed"         // finalize failed (decline etc.)
  | "onboarding_started"
  | "onboarding_step_completed"
  | "onboarding_completed"
  | "first_core_action";

const START_KEY = "vela.funnelStart";
const ONBOARDING_START_KEY = "vela.onboardingStart";
const FIRST_ACTION_KEY = "vela.firstCoreActionAt";

function nowMs() { return Date.now(); }

/** Mark the trial signup start time (idempotent per session). */
export function markSignupStart() {
  if (typeof window === "undefined") return;
  if (!sessionStorage.getItem(START_KEY)) {
    sessionStorage.setItem(START_KEY, String(nowMs()));
  }
}

export function markOnboardingStart() {
  if (typeof window === "undefined") return;
  if (!sessionStorage.getItem(ONBOARDING_START_KEY)) {
    sessionStorage.setItem(ONBOARDING_START_KEY, String(nowMs()));
  }
}

function elapsedSince(key: string): number | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return nowMs() - n;
}

export async function trackSignupEvent(
  event: SignupEvent,
  payload: Record<string, unknown> = {},
) {
  try {
    const enriched: Record<string, unknown> = { ...payload };
    if (event === "trial_signup_completed" || event === "trial_signup_failed") {
      const dur = elapsedSince(START_KEY);
      if (dur !== null) enriched.duration_ms = dur;
    }
    if (event === "onboarding_completed") {
      const dur = elapsedSince(ONBOARDING_START_KEY);
      if (dur !== null) {
        enriched.duration_ms = dur;
        enriched.hit_30s_goal = dur <= 30_000;
      }
    }
    if (event === "first_core_action") {
      // Only fire once per browser per user.
      if (typeof window !== "undefined" && localStorage.getItem(FIRST_ACTION_KEY)) return;
      if (typeof window !== "undefined") localStorage.setItem(FIRST_ACTION_KEY, new Date().toISOString());
      const dur = elapsedSince(ONBOARDING_START_KEY);
      if (dur !== null) enriched.time_to_first_action_ms = dur;
    }

    // eslint-disable-next-line no-console
    console.info(`[signup-funnel] ${event}`, enriched);

    const { data: { user } } = await supabase.auth.getUser();
    const feature = event.startsWith("onboarding") || event === "first_core_action"
      ? "onboarding"
      : "signup_funnel";
    await (supabase as any).from("ai_event_log").insert({
      user_id: user?.id ?? null,
      event_type: event,
      feature,
      payload: enriched,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[signup-funnel] insert failed", e);
  }
}

/**
 * Convenience helper: fire from Dashboard/Home/first-portfolio flow once a user
 * takes any meaningful action after onboarding. Deduped via localStorage.
 */
export function trackFirstCoreAction(action: string, extra: Record<string, unknown> = {}) {
  return trackSignupEvent("first_core_action", { action, ...extra });
}