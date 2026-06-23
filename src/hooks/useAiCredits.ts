import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-access-status");
      if (error) throw error;
      const next = data as AiCreditsStatus;
      setStatus(next);
      writeCache(next);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[useAiCredits] fetch failed", e);
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

  return { status, loading, refresh, unlimited, hasCap, used, limit, remaining, pctUsed, exhausted };
}