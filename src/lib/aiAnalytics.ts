import { supabase } from "@/integrations/supabase/client";

export type AIEventType =
  | "ai_access_denied_shown"
  | "ai_upgrade_cta_clicked"
  | "ai_byo_cta_clicked"
  | "ai_briefing_request"
  | "ai_briefing_error";

/**
 * In-memory dedupe / rate-limit so a repeated 402 storm doesn't flood
 * ai_event_log. Only applies to `ai_access_denied_shown` (clicks are always
 * recorded — they're rare and conversion-critical).
 *
 * Rules:
 *   - Same (eventType + reason) key: suppress if logged in the last 60s.
 *   - Global per-session cap for denials: max 5 per rolling minute.
 */
const DEDUPE_WINDOW_MS = 60_000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_DENIALS = 5;
const lastSeen = new Map<string, number>();
const denialTimestamps: number[] = [];

function shouldSuppressDenial(reason: string): { suppress: boolean; cause?: string } {
  const now = Date.now();
  const key = `ai_access_denied_shown::${reason || "unknown"}`;
  const prev = lastSeen.get(key);
  if (prev && now - prev < DEDUPE_WINDOW_MS) {
    return { suppress: true, cause: "dedupe_window" };
  }
  // Drop denials older than RATE_WINDOW_MS, then enforce cap.
  while (denialTimestamps.length && now - denialTimestamps[0] > RATE_WINDOW_MS) {
    denialTimestamps.shift();
  }
  if (denialTimestamps.length >= RATE_MAX_DENIALS) {
    return { suppress: true, cause: "rate_cap" };
  }
  lastSeen.set(key, now);
  denialTimestamps.push(now);
  return { suppress: false };
}

export async function trackAIEvent(
  eventType: AIEventType,
  payload: Record<string, unknown> = {},
  feature = "market-briefing",
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const correlationId = (payload as any).correlationId ?? null;

    if (eventType === "ai_access_denied_shown") {
      const reason = String((payload as any).reason ?? "");
      const { suppress, cause } = shouldSuppressDenial(reason);
      if (suppress) {
        // eslint-disable-next-line no-console
        console.info(`[ai-analytics] suppressed`, {
          eventType, cause, reason, correlationId, userId: user?.id,
        });
        return;
      }
    }

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

// Exposed for tests to reset dedupe state between specs.
export function __resetAIAnalyticsForTests() {
  lastSeen.clear();
  denialTimestamps.length = 0;
}