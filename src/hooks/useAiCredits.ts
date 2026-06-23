import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AiCreditsStatus {
  allowed: boolean;
  source: "byo" | "beta" | "paid" | "none" | "opt_out";
  tier: string;
  modelCap: string;
  quotaUsed: number | null;
  quotaLimit: number | null; // -1 = unlimited, 0 = none, >0 = monthly cap
  byoProvider: string | null;
  reason: string | null;
}

const CACHE_KEY = "vela.ai_credits_status";
const CACHE_TTL_MS = 60_000; // 1 minute
const NOTIFY_KEY = "vela.ai_credits_notify"; // dedupe per browser/month

function monthKey() { return new Date().toISOString().slice(0, 7); }
function alreadyNotified(kind: "warn80" | "exhausted"): boolean {
  try {
    const raw = localStorage.getItem(NOTIFY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed[`${kind}:${monthKey()}`] === true;
  } catch { return false; }
}
function markNotified(kind: "warn80" | "exhausted") {
  try {
    const raw = localStorage.getItem(NOTIFY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[`${kind}:${monthKey()}`] = true;
    localStorage.setItem(NOTIFY_KEY, JSON.stringify(parsed));
  } catch {}
}
async function fireThreshold(kind: "warn80" | "exhausted", used: number, limit: number) {
  if (alreadyNotified(kind)) return;
  markNotified(kind);
  if (kind === "exhausted") {
    toast.error("AI credits exhausted", {
      description: `You've used all ${limit} monthly AI credits. Paper trading and other features keep working.`,
      duration: 8000,
    });
  } else {
    toast.warning("AI credits at 80%", {
      description: `${used}/${limit} used this month. Non-AI features are unaffected.`,
      duration: 6000,
    });
  }
  try { await supabase.functions.invoke("ai-credits-notify", { body: { kind, used, limit } }); } catch {}
}

function readCache(): { value: AiCreditsStatus; ts: number } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(value: AiCreditsStatus) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ value, ts: Date.now() }));
  } catch {
    /* noop */
  }
}

/**
 * Fetches the caller's current AI credit standing (monthly used vs cap),
 * plan tier, and whether AI is currently allowed. Non-AI features in the
 * app are unaffected by this — this hook only describes AI access.
 */
export function useAiCredits(autoRefreshMs = 0) {
  const cached = readCache();
  const [status, setStatus] = useState<AiCreditsStatus | null>(cached?.value ?? null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-access-status");
      if (error) throw error;
      const next = data as AiCreditsStatus;
      setStatus(next);
      writeCache(next);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[useAiCredits] fetch failed", e);
      setError((e as Error)?.message || "Failed to load AI credit status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!cached) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoRefreshMs) return;
    const t = setInterval(refresh, autoRefreshMs);
    return () => clearInterval(t);
  }, [autoRefreshMs, refresh]);

  const limit = status?.quotaLimit ?? null;
  const used = status?.quotaUsed ?? 0;
  const unlimited = limit === -1 || status?.source === "byo";
  const hasCap = typeof limit === "number" && limit > 0;
  const remaining = hasCap ? Math.max(0, (limit as number) - used) : null;
  const pctUsed = hasCap ? Math.min(100, Math.round((used / (limit as number)) * 100)) : 0;
  const exhausted = hasCap ? used >= (limit as number) : false;

  useEffect(() => {
    if (!hasCap) return;
    if (exhausted) void fireThreshold("exhausted", used, limit as number);
    else if (pctUsed >= 80) void fireThreshold("warn80", used, limit as number);
  }, [hasCap, exhausted, pctUsed, used, limit]);

  return { status, loading, error, refresh, unlimited, hasCap, used, limit, remaining, pctUsed, exhausted };
}