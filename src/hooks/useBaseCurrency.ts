import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Single source of truth for the user's preferred base currency
 * (`profiles.base_currency`). Every net-worth / dashboard surface
 * MUST consume this - never hard-code a currency string.
 *
 * Fallback chain: profile → localStorage override → "EUR".
 */
const LS_KEY = "vela.base_currency";

export function useBaseCurrency(): {
  baseCurrency: string;
  setBaseCurrency: (c: string) => Promise<void>;
  loading: boolean;
} {
  const { user } = useAuth();
  const [baseCurrency, setBase] = useState<string>(() => {
    if (typeof window === "undefined") return "EUR";
    return window.localStorage?.getItem(LS_KEY) || "EUR";
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("base_currency")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const fromDb = (data as any)?.base_currency;
      if (fromDb) {
        setBase(fromDb);
        try { window.localStorage?.setItem(LS_KEY, fromDb); } catch { /* ignore */ }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const setBaseCurrency = async (c: string) => {
    const next = (c || "EUR").toUpperCase();
    setBase(next);
    try { window.localStorage?.setItem(LS_KEY, next); } catch { /* ignore */ }
    if (user) {
      await supabase
        .from("profiles")
        .update({ base_currency: next })
        .eq("user_id", user.id);
    }
  };

  return { baseCurrency, setBaseCurrency, loading };
}