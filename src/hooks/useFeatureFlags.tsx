import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FeatureFlag = {
  key: string;
  enabled: boolean;
  label?: string;
  description?: string | null;
  category?: string;
};

interface Ctx {
  flags: Record<string, FeatureFlag>;
  loading: boolean;
  isEnabled: (key: string, fallback?: boolean) => boolean;
  refresh: () => Promise<void>;
}

const FeatureFlagsContext = createContext<Ctx>({
  flags: {},
  loading: true,
  isEnabled: (_k, fallback = true) => fallback,
  refresh: async () => {},
});

export const FeatureFlagsProvider = ({ children }: { children: ReactNode }) => {
  const [flags, setFlags] = useState<Record<string, FeatureFlag>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // Use the SECURITY DEFINER RPC: regular users can read on/off state of every flag
    // without exposing internal labels, descriptions, or categories.
    const { data, error } = await (supabase as any).rpc("get_enabled_feature_flags");
    if (!error && Array.isArray(data)) {
      const map: Record<string, FeatureFlag> = {};
      for (const f of data) map[f.key] = { key: f.key, enabled: !!f.enabled };
      setFlags(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("feature_flags_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "feature_flags" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  const isEnabled = useCallback(
    (key: string, fallback = true) => (flags[key]?.enabled ?? fallback),
    [flags]
  );

  return (
    <FeatureFlagsContext.Provider value={{ flags, loading, isEnabled, refresh }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
};

export const useFeatureFlags = () => useContext(FeatureFlagsContext);
export const useFlag = (key: string, fallback = true) => {
  const { isEnabled } = useFeatureFlags();
  return isEnabled(key, fallback);
};