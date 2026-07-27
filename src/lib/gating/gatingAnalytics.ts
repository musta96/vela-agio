/**
 * Analytics for the gated / locked-route funnel.
 *
 * Fires three event families:
 *   • `locked_route_view`    — a locked upgrade screen mounted
 *   • `locked_route_cta`     — the user clicked a CTA on it
 *   • `locked_route_dwell`   — how long they stayed (ms) before leaving
 *
 * Sinks (best-effort, non-blocking):
 *   • `console.info` for local dev
 *   • `window` CustomEvent `vela:locked-route` — external observability
 *   • Supabase `ai_event_log` (feature="gating")
 *   • PostHog `posthog.capture` when the browser SDK is loaded
 */

import { supabase } from "@/integrations/supabase/client";

export type GatingEventType =
  | "locked_route_view"
  | "locked_route_cta"
  | "locked_route_dwell";

export type LockedCta =
  | "primary_upgrade"
  | "see_whats_inside"
  | "compare_plans"
  | "plan_card_cta"
  | "close_modal";

export interface GatingEventBase {
  feature: string;
  planSlug?: string | null;
  requiredPlanSlug?: string | null;
  pathname?: string;
}

function safeConsole(evt: GatingEventType, payload: unknown) {
  try {
    // eslint-disable-next-line no-console
    console.info(`[gating-analytics] ${evt}`, payload);
  } catch { /* ignore */ }
}

function safeDom(evt: GatingEventType, payload: unknown) {
  if (typeof window === "undefined" || typeof CustomEvent !== "function") return;
  try {
    window.dispatchEvent(
      new CustomEvent("vela:locked-route", { detail: { type: evt, ...(payload as object) } }),
    );
  } catch { /* ignore */ }
}

function safePosthog(evt: GatingEventType, payload: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const ph = (window as unknown as { posthog?: { capture?: (n: string, p: unknown) => void } }).posthog;
  try { ph?.capture?.(evt, payload); } catch { /* ignore */ }
}

async function safeSupabase(evt: GatingEventType, payload: Record<string, unknown>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await (supabase as any).from("ai_event_log").insert({
      user_id: user?.id ?? null,
      event_type: evt,
      feature: "gating",
      payload,
    });
  } catch { /* best-effort */ }
}

function emit(evt: GatingEventType, payload: Record<string, unknown>) {
  safeConsole(evt, payload);
  safeDom(evt, payload);
  safePosthog(evt, payload);
  void safeSupabase(evt, payload);
}

export function trackLockedRouteView(input: GatingEventBase) {
  emit("locked_route_view", { ...input, ts: Date.now() });
}

export function trackLockedRouteCta(
  input: GatingEventBase & { cta: LockedCta; target?: string },
) {
  emit("locked_route_cta", { ...input, ts: Date.now() });
}

export function trackLockedRouteDwell(
  input: GatingEventBase & { durationMs: number },
) {
  emit("locked_route_dwell", { ...input, ts: Date.now() });
}