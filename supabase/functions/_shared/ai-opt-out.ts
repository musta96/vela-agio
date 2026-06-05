// Shared helper: returns true if the authenticated user has disabled AI
// processing for their account (Privacy Settings → AI features off).
// Used by AI edge functions that don't go through resolveAiAccess
// (analyze-sentiment, news-triage, portfolio-doctor, etc.) so the opt-out
// is enforced end-to-end, not just on the Copilot.

import { createClient } from "npm:@supabase/supabase-js@2";

export async function isAiOptedOut(authHeader: string | null): Promise<boolean> {
  try {
    if (!authHeader?.startsWith("Bearer ")) return false;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const sb = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;
    const { data } = await sb.from("profiles").select("ai_opt_out").eq("user_id", user.id).maybeSingle();
    return Boolean(data?.ai_opt_out);
  } catch {
    return false; // fail-open on probe errors — the primary chokepoint (ai-access) is still in place
  }
}

export function aiOptOutResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: "ai_opt_out",
      reason: "You have disabled AI features for your account in Privacy settings. Re-enable them to use this feature.",
      opt_out_url: "/privacy-settings",
    }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}