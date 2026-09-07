// portfolio-fit — "Does adding this instrument to my portfolio make sense?"
//
// Deterministic first: correlation with the existing book, volatility, the
// effect on portfolio volatility and concentration, currency and country
// overlap. An AI narrative is layered on top when the caller has AI access;
// without it the quantitative verdict is still returned (never a hard error).

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveAIConfig } from "../_shared/ai-provider.ts";
import { resolveAiAccess, logAiUsage } from "../_shared/ai-access.ts";

interface Body {
  symbol: string;
  name?: string;
  portfolioId?: string | null;
  weightPct?: number; // intended weight of the new position, default 5%
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Daily closes for the last year. Returns [] when no provider covers it. */
async function closes(symbol: string): Promise<number[]> {
  for (const host of ["query1", "query2"]) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!r.ok) continue;
      const j = await r.json();
      const res = j?.chart?.result?.[0];
      const arr: Array<number | null> = res?.indicators?.quote?.[0]?.close ?? [];
      const out = arr.filter((v): v is number => typeof v === "number" && isFinite(v) && v > 0);
      if (out.length >= 30) return out;
    } catch { /* try next host */ }
  }
  return [];
}

const rets = (px: number[]) => px.slice(1).map((p, i) => p / px[i] - 1);
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function stdev(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}

function corr(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 20) return 0;
  const x = a.slice(-n), y = b.slice(-n);
  const mx = mean(x), my = mean(y);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}

const ANNUAL = Math.sqrt(252);

function suffixCountry(symbol: string): string {
  const dot = symbol.lastIndexOf(".");
  return dot < 0 ? "US" : symbol.slice(dot + 1).toUpperCase();
}

async function aiNarrative(
  auth: string | null,
  ctx: Record<string, unknown>,
): Promise<{ text: string | null; model?: string }> {
  try {
    const cfg = await resolveAIConfig(auth);
    const r = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: "POST",
      headers: { ...cfg.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          {
            role: "system",
            content:
              "You are a portfolio analyst. Given quantitative fit metrics for adding one instrument to an existing portfolio, write 4-6 short sentences: what the position adds or duplicates, its effect on risk and concentration, the main caveat, and a clear 'fits / fits with a smaller size / does not add much' conclusion. No disclaimers, no bullet lists, no invented data.",
          },
          { role: "user", content: JSON.stringify(ctx) },
        ],
        max_completion_tokens: 500,
      }),
    });
    if (!r.ok) return { text: null };
    const j = await r.json();
    return { text: j?.choices?.[0]?.message?.content?.trim() ?? null, model: cfg.model };
  } catch {
    return { text: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    const symbol = String(body?.symbol ?? "").trim().toUpperCase();
    if (!symbol) return json({ error: "symbol required" }, 400);
    const targetWeight = Math.min(0.5, Math.max(0.005, (Number(body.weightPct) || 5) / 100));

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "auth_required", reason: "Sign in to compare an instrument with your portfolio." }, 401);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userRes } = await supa.auth.getUser();
    if (!userRes?.user) return json({ error: "auth_required", reason: "Sign in to compare an instrument with your portfolio." }, 401);

    let q = supa.from("portfolio_holdings").select("symbol,name,shares,avg_price,currency,portfolio_id");
    if (body.portfolioId) q = q.eq("portfolio_id", body.portfolioId);
    const { data: rows, error } = await q;
    if (error) return json({ error: error.message }, 400);

    const holdings = (rows ?? []).filter((h: any) => Number(h.shares) > 0);
    if (holdings.length === 0) {
      return json({
        symbol,
        empty: true,
        message: "This portfolio has no holdings yet, so there is nothing to compare against.",
      });
    }

    // Weights from cost basis (live price is not needed for a fit study).
    const values = holdings.map((h: any) => Number(h.shares) * Number(h.avg_price || 0));
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const weights = values.map((v) => v / total);

    const [candidatePx, ...holdingPx] = await Promise.all([
      closes(symbol),
      ...holdings.map((h: any) => closes(String(h.symbol))),
    ]);

    const candidateRets = rets(candidatePx);
    const covered = holdings
      .map((h: any, i: number) => ({ symbol: String(h.symbol), name: h.name, weight: weights[i], r: rets(holdingPx[i] ?? []) }))
      .filter((x) => x.r.length >= 30);

    const already = holdings.find((h: any) => String(h.symbol).toUpperCase() === symbol);

    let portRets: number[] = [];
    if (covered.length) {
      const n = Math.min(...covered.map((c) => c.r.length));
      const wsum = covered.reduce((a, c) => a + c.weight, 0) || 1;
      portRets = Array.from({ length: n }, (_, i) =>
        covered.reduce((s, c) => s + (c.r.slice(-n)[i] * c.weight) / wsum, 0));
    }

    const candVol = candidateRets.length ? stdev(candidateRets) * ANNUAL : null;
    const portVol = portRets.length ? stdev(portRets) * ANNUAL : null;
    const corrPortfolio = candidateRets.length && portRets.length ? corr(candidateRets, portRets) : null;

    // Volatility of the portfolio after adding the position at target weight.
    let blendedVol: number | null = null;
    if (candidateRets.length && portRets.length) {
      const n = Math.min(candidateRets.length, portRets.length);
      const blended = Array.from({ length: n }, (_, i) =>
        portRets.slice(-n)[i] * (1 - targetWeight) + candidateRets.slice(-n)[i] * targetWeight);
      blendedVol = stdev(blended) * ANNUAL;
    }

    const perHolding = covered
      .map((c) => ({ symbol: c.symbol, name: c.name, weight: c.weight, correlation: candidateRets.length ? corr(candidateRets, c.r) : null }))
      .sort((a, b) => (b.correlation ?? -2) - (a.correlation ?? -2));

    // Concentration before / after
    const hhi = weights.reduce((a, w) => a + w * w, 0);
    const newWeights = weights.map((w) => w * (1 - targetWeight)).concat(targetWeight);
    const hhiAfter = newWeights.reduce((a, w) => a + w * w, 0);

    // Currency and listing-country exposure
    const curMap: Record<string, number> = {};
    const geoMap: Record<string, number> = {};
    holdings.forEach((h: any, i: number) => {
      const cur = (h.currency || "EUR").toUpperCase();
      curMap[cur] = (curMap[cur] ?? 0) + weights[i];
      const g = suffixCountry(String(h.symbol));
      geoMap[g] = (geoMap[g] ?? 0) + weights[i];
    });
    const candidateVenue = suffixCountry(symbol);

    const highCorr = perHolding.filter((p) => (p.correlation ?? 0) > 0.8);
    let verdict: "diversifying" | "neutral" | "overlapping" | "duplicate" = "neutral";
    if (already) verdict = "duplicate";
    else if ((corrPortfolio ?? 0) > 0.85 || highCorr.length >= 2) verdict = "overlapping";
    else if ((corrPortfolio ?? 1) < 0.55) verdict = "diversifying";

    const metrics = {
      targetWeight,
      holdingsCount: holdings.length,
      coveredCount: covered.length,
      candidateVolatility: candVol,
      portfolioVolatility: portVol,
      portfolioVolatilityAfter: blendedVol,
      volatilityDelta: blendedVol != null && portVol != null ? blendedVol - portVol : null,
      correlationWithPortfolio: corrPortfolio,
      mostCorrelated: perHolding.slice(0, 5),
      leastCorrelated: perHolding.slice(-3).reverse(),
      hhi, hhiAfter,
      alreadyHeld: already
        ? { shares: Number(already.shares), avgPrice: Number(already.avg_price), weight: weights[holdings.indexOf(already)] }
        : null,
      currencyExposure: Object.entries(curMap).sort((a, b) => b[1] - a[1]),
      venueExposure: Object.entries(geoMap).sort((a, b) => b[1] - a[1]),
      candidateVenue,
      venueWeightAfter: ((geoMap[candidateVenue] ?? 0) * (1 - targetWeight)) + targetWeight,
      noPriceHistory: candidatePx.length === 0,
    };

    const access = await resolveAiAccess(auth);
    let narrative: string | null = null;
    let model: string | undefined;
    if (access.allowed) {
      const ai = await aiNarrative(auth, { symbol, name: body.name ?? symbol, verdict, metrics });
      narrative = ai.text;
      model = ai.model;
      if (narrative) {
        await logAiUsage({
          userId: access.userId, feature: "portfolio_doctor", model,
          provider: access.source === "byo" ? "byo" : "lovable", credits: 6, costCents: 12,
        }).catch(() => {});
      }
    }

    return json({
      symbol,
      name: body.name ?? symbol,
      portfolioId: body.portfolioId ?? null,
      verdict,
      metrics,
      narrative,
      aiAvailable: access.allowed,
      aiReason: access.allowed ? null : (access.reason ?? "AI commentary needs a paid plan or your own key."),
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("portfolio-fit error", e);
    return json({ error: e?.message ?? "Internal error" }, 500);
  }
});
