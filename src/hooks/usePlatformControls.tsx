import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PlatformControl {
  key: string;
  enabled: boolean;
  reason: string | null;
  updated_at: string;
}
export interface PlatformBanner {
  id: string;
  message: string;
  severity: "info" | "warning" | "critical";
  active: boolean;
  expires_at: string | null;
  created_at: string;
}

export function usePlatformControls() {
  const [controls, setControls] = useState<Record<string, PlatformControl>>({});
  const [banners, setBanners] = useState<PlatformBanner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [{ data: c }, { data: b }] = await Promise.all([
        supabase.from("platform_controls").select("*"),
        supabase.from("platform_banners").select("*").eq("active", true).order("created_at", { ascending: false }),
      ]);
      if (!alive) return;
      const map: Record<string, PlatformControl> = {};
      for (const row of (c || []) as PlatformControl[]) map[row.key] = row;
      setControls(map);
      const now = Date.now();
      setBanners(((b || []) as PlatformBanner[]).filter((x) => !x.expires_at || new Date(x.expires_at).getTime() > now));
      setLoading(false);
    };
    load();
    const channel = supabase
      .channel("platform-controls")
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_controls" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_banners" }, load)
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, []);

  return { controls, banners, loading, isOn: (k: string) => !!controls[k]?.enabled };
}