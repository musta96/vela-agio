// Fetches the caller's investor profile (MiFID II-style suitability) via RLS.
// Returns a compact summary string suitable for injection into AI system prompts.
export async function getInvestorProfileSummary(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anon) return null;
  try {
    const r = await fetch(`${url}/rest/v1/investor_profiles?select=profile_name,score,risk_level,horizon_years,esg_preference,loss_tolerance_pct,objectives,excluded_sectors,notes&limit=1`, {
      headers: { apikey: anon, Authorization: authHeader },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    const p = rows?.[0];
    if (!p) return null;
    const parts = [
      p.profile_name && `Profile: ${p.profile_name} (score ${p.score}/30, SRI ${p.risk_level}/7)`,
      p.horizon_years != null && `Horizon: ${p.horizon_years}y`,
      p.loss_tolerance_pct != null && `Max acceptable drawdown: ${p.loss_tolerance_pct}%`,
      p.esg_preference && `ESG: ${p.esg_preference}`,
      p.objectives?.length && `Objectives: ${p.objectives.join(', ')}`,
      p.excluded_sectors?.length && `Excluded sectors: ${p.excluded_sectors.join(', ')}`,
      p.notes && `Notes: ${String(p.notes).slice(0, 300)}`,
    ].filter(Boolean);
    return parts.length ? parts.join(' | ') : null;
  } catch { return null; }
}