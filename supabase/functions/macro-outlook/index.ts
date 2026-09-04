// Macro outlook edge function.
// Given a lightweight strategy descriptor (risk profile, allocation, currency,
// horizon, optional thesis) it returns a base/bull/bear macro narrative plus a
// short regime label and a list of citation-friendly sources, so memo callers
// don't need to hand-author macro paragraphs.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";
import { gatherOfficialDocs, type OfficialDoc } from "../_shared/official-sources.ts";

const BodySchema = z.object({
  risk_profile: z.string().optional(),
  base_currency: z.string().optional(),
  horizon: z.string().optional(),
  thesis: z.string().optional(),
  allocation: z.record(z.string(), z.number()).optional(),
});

const OutputSchema = z.object({
  headline: z.string().min(1),
  regime: z.string().min(1),
  base: z.string().min(20),
  bull: z.string().min(20),
  bear: z.string().min(20),
});

type Body = z.infer<typeof BodySchema>;
type Output = z.infer<typeof OutputSchema>;

const REF_SOURCES = [
  { label: "IMF World Economic Outlook", url: "https://www.imf.org/en/Publications/WEO" },
  { label: "OECD Economic Outlook", url: "https://www.oecd.org/economic-outlook/" },
  { label: "Federal Reserve SEP", url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" },
  { label: "ECB macroeconomic projections", url: "https://www.ecb.europa.eu/pub/projections/html/index.en.html" },
];

function fallbackMacro(body: Body): Output {
  const rp = (body.risk_profile ?? "balanced").toLowerCase();
  const ccy = (body.base_currency ?? "EUR").toUpperCase();
  return {
    headline: `Late-cycle expansion with disinflation intact; ${ccy} strategy stance held at ${rp}.`,
    regime: "Late-cycle, disinflation",
    base: `Growth converges to trend as core inflation grinds toward 2%. Policy stays modestly restrictive with cautious cuts. Real yields drift lower, credit spreads range-bound; a ${rp} book compounds coupons and quality earnings.`,
    bull: `Productivity surprises to the upside, earnings breadth widens, and central banks cut faster than priced. Duration and quality growth outperform; risk-on tilt within the ${rp} mandate is warranted.`,
    bear: `Sticky services inflation delays easing; growth cracks under lagged tightening. Equity multiples compress, credit widens, USD firms; defensive rotation and duration barbell defend the ${rp} risk budget.`,
  };
}

/** Pull the current stance straight from the IMF, Fed and ECB before writing. */
async function officialEvidence(body: Body): Promise<OfficialDoc[]> {
  const query = [
    body.thesis ?? "",
    "monetary policy outlook inflation growth",
    body.base_currency ?? "EUR",
  ].join(" ").trim();
  try {
    return await gatherOfficialDocs(query, { authorities: ["IMF", "FED", "ECB"], perSource: 3 });
  } catch (e) {
    console.warn("[macro-outlook] evidence retrieval failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

async function callLovableAI(body: Body, apiKey: string, evidence: OfficialDoc[]): Promise<Output> {
  const alloc = body.allocation
    ? Object.entries(body.allocation).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([s, w]) => `${s} ${(w * 100).toFixed(1)}%`).join(", ")
    : "not provided";
  const sys = `You are a senior macro strategist writing the "Macro context" section of an institutional investment memo. Return STRICT JSON matching {"headline","regime","base","bull","bear"}. No markdown, no citations inside prose, no em dashes. Each of base/bull/bear must be one dense paragraph (60-110 words). Ground every claim in current cycle facts (rates, inflation, growth, liquidity). Do not fabricate specific numbers.`;
  const user = `Strategy inputs:
- Risk profile: ${body.risk_profile ?? "balanced"}
- Base currency: ${body.base_currency ?? "EUR"}
- Horizon: ${body.horizon ?? "12 months"}
- Top allocation: ${alloc}
- Thesis (optional): ${body.thesis ?? "(none supplied)"}

Write the macro outlook tailored to how this book would behave in each scenario.

OFFICIAL SOURCE MATERIAL (IMF WEO figures, Federal Reserve and ECB releases retrieved just now — use these facts, do not contradict them):
${evidence.length
    ? evidence.map((d) => `- [${d.authority}] ${d.title}${d.published ? ` (${d.published})` : ""}\n  ${d.excerpt.slice(0, 700)}`).join("\n")
    : "(retrieval returned nothing — stay qualitative and avoid specific figures)"}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`gateway_${res.status}`);
  const j = await res.json();
  const raw = j?.choices?.[0]?.message?.content ?? "";
  const parsed = OutputSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("ai_output_invalid");
  return parsed.data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  let raw: unknown;
  try { raw = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: "validation_failed", details: parsed.error.flatten() }, 400);

  const evidence = await officialEvidence(parsed.data);
  const key = Deno.env.get("LOVABLE_API_KEY");
  let out: Output;
  let fallback = false;
  try {
    if (!key) throw new Error("missing_lovable_api_key");
    out = await callLovableAI(parsed.data, key, evidence);
  } catch (err) {
    console.warn("[macro-outlook] falling back:", err instanceof Error ? err.message : err);
    out = fallbackMacro(parsed.data);
    fallback = true;
  }

  const retrieved = new Date().toISOString();
  // Real retrieved documents first; the standing landing pages only fill in
  // when an authority could not be reached.
  const live = evidence.filter((d) => d.retrieved).map((d) => ({
    label: `${d.authority} — ${d.title}`, url: d.url, authority: d.authority,
    published: d.published ?? null, excerpt: d.excerpt.slice(0, 400), retrieved_at: retrieved,
  }));
  const sources = live.length ? live : REF_SOURCES.map((s) => ({ ...s, retrieved_at: retrieved }));
  return json({
    macro: out,
    sources,
    evidence,
    authorities_covered: [...new Set(evidence.filter((d) => d.retrieved).map((d) => d.authority))],
    fallback,
  }, 200);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}