import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { defaultMarketForCountry, getMarketStatus, type MarketId } from "@/lib/marketHours";
import { useAuth } from "@/hooks/useAuth";

// Reads profile.preferred_market (or infers from country_residence) and
// returns the live status for that exchange, recomputed every 30 seconds.
export function useMarketClock() {
  const { user } = useAuth();
  const [marketId, setMarketId] = useState<MarketId>("XMIL");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    supabase
      .from("profiles")
      .select("preferred_market, country_residence")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const id = (data.preferred_market as MarketId) || defaultMarketForCountry(data.country_residence);
        setMarketId(id);
      });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    const i = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(i);
  }, []);

  const status = getMarketStatus(marketId);
  return { marketId, ...status, _tick: tick };
}