import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type CompanyKind = "startup" | "private";

export interface PrivateCompany {
  id: string;
  kind: CompanyKind;
  name: string;
  website: string | null;
  country: string;
  sector: string;
  stage: string;
  currency: string;
  round_name: string | null;
  round_date: string | null;
  round_size: number | null;
  pre_money: number | null;
  post_money: number | null;
  amount_invested: number | null;
  ownership_pct: number | null;
  current_valuation: number | null;
  status: string;
  description: string | null;
  notes: string | null;
  inputs: Record<string, unknown>;
  last_valuation: Record<string, unknown> | null;
  last_valued_at: string | null;
  created_at: string;
}

export type CompanyDraft = Partial<Omit<PrivateCompany, "id" | "created_at">> & { name: string };

/** Companies the user tracks privately: startups on the watchlist and private-equity holdings. */
export function usePrivateCompanies(kind: CompanyKind) {
  const [items, setItems] = useState<PrivateCompany[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("private_companies")
      .select("*")
      .eq("kind", kind)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data ?? []) as unknown as PrivateCompany[]);
    setLoading(false);
  }, [kind]);

  useEffect(() => { void load(); }, [load]);

  const add = useCallback(async (draft: CompanyDraft) => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { toast.error("Sign in first"); return null; }
    const { data, error } = await supabase
      .from("private_companies")
      .insert({ ...draft, kind, user_id: auth.user.id } as never)
      .select("*")
      .single();
    if (error) { toast.error(error.message); return null; }
    setItems((prev) => [data as unknown as PrivateCompany, ...prev]);
    return data as unknown as PrivateCompany;
  }, [kind]);

  const update = useCallback(async (id: string, patch: Partial<PrivateCompany>) => {
    const { error } = await supabase
      .from("private_companies")
      .update({ ...patch, updated_at: new Date().toISOString() } as never)
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("private_companies").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setItems((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { items, loading, reload: load, add, update, remove };
}

export const STAGE_OPTIONS = [
  { id: "pre_seed", label: "Pre-seed" },
  { id: "seed", label: "Seed" },
  { id: "series_a", label: "Series A" },
  { id: "series_b", label: "Series B" },
  { id: "series_c", label: "Series C" },
  { id: "growth", label: "Growth / pre-IPO" },
];

export const SECTOR_OPTIONS = ["ai", "software", "saas", "fintech", "insurtech", "marketplace", "ecommerce", "consumer",
  "gaming", "healthtech", "biotech", "medtech", "deeptech", "semiconductors", "hardware", "robotics", "mobility",
  "energy", "climate", "agritech", "proptech", "logistics", "edtech", "cybersecurity", "space", "foodtech", "services", "other"];

export const COUNTRY_OPTIONS = ["IT", "FR", "DE", "ES", "CH", "GB", "IE", "NL", "SE", "DK", "FI", "NO", "PL", "PT",
  "AT", "BE", "US", "CA", "AE", "SA", "IL", "TR", "EG", "IN", "SG", "JP", "KR", "CN", "AU", "BR", "MX", "AR", "ZA", "NG", "KE"];

/** Broad geography buckets used by the private-equity analytics. */
export const REGION_OF: Record<string, string> = {
  IT: "Italy", FR: "Europe", DE: "Europe", ES: "Europe", CH: "Europe", GB: "UK & Ireland", IE: "UK & Ireland",
  NL: "Europe", SE: "Nordics", DK: "Nordics", FI: "Nordics", NO: "Nordics", PL: "CEE", PT: "Europe", AT: "Europe",
  BE: "Europe", US: "North America", CA: "North America", AE: "MENA", SA: "MENA", IL: "MENA", TR: "MENA", EG: "MENA",
  IN: "India", SG: "APAC", JP: "APAC", KR: "APAC", CN: "APAC", AU: "APAC", BR: "LatAm", MX: "LatAm", AR: "LatAm",
  ZA: "Africa", NG: "Africa", KE: "Africa",
};

export const money = (v: number | null | undefined, cur = "EUR") => {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  const abs = Math.abs(n);
  const s = abs >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : abs >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : abs >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toFixed(0);
  return `${cur} ${s}`;
};
