// Persistent storage for the bond calculator's comparison sets. Each user's
// saved bonds live in `public.bond_saved_bonds` (RLS-locked to auth.uid()).

import { supabase } from "@/integrations/supabase/client";

export interface SavedBondPayload {
  face: number;
  couponRate: number;
  years: number;
  frequency: number;
  yieldRate: number;
  dayCount: string;
  bondType: string;
  settlement: string;
  accruedFraction: number;
  color: string;
  // Optional advanced fields (embedded options / curve overlay).
  volatility?: number;
  calls?: { time: number; price: number }[];
  puts?: { time: number; price: number }[];
  curve?: { t: number; rate: number }[];
  oasBps?: number;
  useCurve?: boolean;
}

export interface SavedBondRow extends SavedBondPayload {
  id: string;
  name: string;
}

export async function listSavedBonds(): Promise<SavedBondRow[]> {
  const { data, error } = await supabase
    .from("bond_saved_bonds")
    .select("id,name,inputs")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id, name: r.name, ...((r.inputs as unknown) as SavedBondPayload),
  }));
}

export async function insertSavedBond(name: string, payload: SavedBondPayload): Promise<SavedBondRow> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Sign in required to save bonds");
  const { data, error } = await supabase
    .from("bond_saved_bonds")
    .insert({ user_id: uid, name, inputs: payload as unknown as Record<string, unknown> })
    .select("id,name,inputs")
    .single();
  if (error) throw error;
  return { id: data.id, name: data.name, ...((data.inputs as unknown) as SavedBondPayload) };
}

export async function deleteSavedBond(id: string): Promise<void> {
  const { error } = await supabase.from("bond_saved_bonds").delete().eq("id", id);
  if (error) throw error;
}