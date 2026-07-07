import { supabase } from "@/integrations/supabase/client";
import { TimingResultSchema, type TimingResult } from "./schema";

export async function fetchTimingSignals(symbol: string): Promise<TimingResult> {
  const { data, error } = await supabase.functions.invoke<TimingResult>("timing-signals", {
    body: { symbol },
  });
  if (error) throw new Error(error.message ?? "timing-signals invoke failed");
  if (!data) throw new Error("timing-signals returned no data");
  return TimingResultSchema.parse(data);
}