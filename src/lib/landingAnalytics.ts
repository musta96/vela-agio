import { supabase } from "@/integrations/supabase/client";

export type LandingEventType =
  | "landing_demo_slide_view"
  | "landing_get_started_click";

const seen = new Set<string>();

/**
 * Fire-and-forget analytics for the public landing page. Logs to console for
 * local dev + inserts into `ai_event_log` (feature="landing") so we can measure
 * whether the product demo reduces sign-up friction.
 *
 * Dedupes identical events per session key to avoid flooding on repeated
 * slide auto-advance loops.
 */
export async function trackLandingEvent(
  eventType: LandingEventType,
  payload: Record<string, unknown> = {},
) {
  try {
    const dedupeKey = `${eventType}::${JSON.stringify(payload)}`;
    if (eventType === "landing_demo_slide_view") {
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
    }

    // eslint-disable-next-line no-console
    console.info(`[landing-analytics] ${eventType}`, payload);

    const { data: { user } } = await supabase.auth.getUser();
    await (supabase as any).from("ai_event_log").insert({
      user_id: user?.id ?? null,
      event_type: eventType,
      feature: "landing",
      payload,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[landing-analytics] insert failed", e);
  }
}

// Test hook
export function __resetLandingAnalyticsForTests() {
  seen.clear();
}