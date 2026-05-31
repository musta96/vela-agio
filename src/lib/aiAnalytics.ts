import { supabase } from "@/integrations/supabase/client";

export type AIEventType =
  | "ai_access_denied_shown"
  | "ai_upgrade_cta_clicked"
  | "ai_byo_cta_clicked"
  | "ai_briefing_request"
  | "ai_briefing_error";

export async function trackAIEvent(
  eventType: AIEventType,
  payload: Record<string, unknown> = {},
  feature = "market-briefing",
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    // Console trace so denials are visible in the browser tools.
    // eslint-disable-next-line no-console
    console.info(`[ai-analytics] ${eventType}`, { feature, ...payload, userId: user?.id });
    await (supabase as any).from("ai_event_log").insert({
      user_id: user?.id ?? null,
      event_type: eventType,
      feature,
      payload,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[ai-analytics] insert failed", e);
  }
}