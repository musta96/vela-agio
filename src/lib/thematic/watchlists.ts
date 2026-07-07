import { supabase } from "@/integrations/supabase/client";
import { ThematicResultSchema, type ThematicResult } from "./schema";

export interface ThematicWatchlistRow {
  id: string;
  name: string;
  theme: string;
  region: string;
  size: string;
  discovery_mode: boolean;
  snapshot: ThematicResult;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function listThematicWatchlists(): Promise<ThematicWatchlistRow[]> {
  const { data, error } = await supabase
    .from("thematic_watchlists")
    .select("id, name, theme, region, size, discovery_mode, snapshot, notes, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ThematicWatchlistRow[];
}

export async function getThematicWatchlist(id: string): Promise<ThematicWatchlistRow | null> {
  const { data, error } = await supabase
    .from("thematic_watchlists")
    .select("id, name, theme, region, size, discovery_mode, snapshot, notes, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as unknown as ThematicWatchlistRow;
  row.snapshot = ThematicResultSchema.parse(row.snapshot);
  return row;
}

export async function saveThematicWatchlist(params: {
  name: string;
  result: ThematicResult;
  notes?: string;
}): Promise<ThematicWatchlistRow> {
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) throw new Error("Sign in to save a thematic watchlist.");
  const { data, error } = await supabase
    .from("thematic_watchlists")
    .insert({
      user_id: user.id,
      name: params.name.trim() || params.result.theme,
      theme: params.result.theme,
      region: params.result.region,
      size: params.result.size,
      discovery_mode: params.result.discoveryMode,
      snapshot: params.result as unknown as Record<string, unknown>,
      notes: params.notes ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as ThematicWatchlistRow;
}

export async function deleteThematicWatchlist(id: string): Promise<void> {
  const { error } = await supabase.from("thematic_watchlists").delete().eq("id", id);
  if (error) throw new Error(error.message);
}