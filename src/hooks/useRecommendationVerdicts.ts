import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

/**
 * Resolves whether AI buy/hold/sell verdict wording should be visible to the
 * current user. Default OFF (descriptive mode only). Resolution order:
 *
 *   1. per-user override on profiles.recommendation_verdicts_override
 *      ("on" | "off")
 *   2. global owner-controlled feature_flag `show_recommendation_verdicts`
 *   3. default → false
 *
 * Enforced server-side via RLS on the underlying tables; this hook is the
 * client-side mirror so descriptive copy can render without a flash of
 * verdict text.
 */
export function useRecommendationVerdicts(): { enabled: boolean; loading: boolean } {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const [flagRes, profRes] = await Promise.all([
        supabase.from("feature_flags").select("enabled").eq("key", "show_recommendation_verdicts").maybeSingle(),
        user
          ? supabase.from("profiles").select("recommendation_verdicts_override").eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);
      if (!active) return;
      const override = (profRes?.data as any)?.recommendation_verdicts_override as string | undefined;
      if (override === "on") setEnabled(true);
      else if (override === "off") setEnabled(false);
      else setEnabled(!!(flagRes.data as any)?.enabled);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user?.id]);

  return { enabled, loading };
}