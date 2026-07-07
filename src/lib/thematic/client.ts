import { supabase } from "@/integrations/supabase/client";
import { ThematicResultSchema, type ThematicResult, type RegionKey, type SizeBand } from "./schema";

export interface ThematicRequest {
  theme: string;
  region?: RegionKey;
  size?: SizeBand;
  discoveryMode?: boolean;
}

export async function fetchThematicDeepDive(req: ThematicRequest): Promise<ThematicResult> {
  const { data, error } = await supabase.functions.invoke<ThematicResult>("thematic-deepdive", { body: req });
  if (error) throw new Error(error.message ?? "thematic-deepdive invoke failed");
  if (!data) throw new Error("thematic-deepdive returned no data");
  return ThematicResultSchema.parse(data);
}