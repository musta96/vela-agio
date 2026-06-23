/**
 * Vela memo PDF generator.
 * Validates the structured analysis JSON, applies fallbacks + sanitization,
 * renders the token-driven HTML, then returns either:
 *   - { pdf_base64 } when a Browserless endpoint is configured, or
 *   - { html } so the client can print it locally (still server-rendered).
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { MemoInputSchema } from "../../../src/lib/memo/schema.ts";
import { applyFallbacks } from "../../../src/lib/memo/fallbacks.ts";
import { renderMemoHtml } from "../../../src/lib/memo/template.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const parsed = MemoInputSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "validation_failed", details: parsed.error.flatten() }, 400);
  }

  const { input, omitted } = applyFallbacks(parsed.data);
  const html = renderMemoHtml(input);

  const browserless = Deno.env.get("BROWSERLESS_URL");
  const browserlessKey = Deno.env.get("BROWSERLESS_API_KEY");
  if (browserless && browserlessKey) {
    try {
      const pdfRes = await fetch(`${browserless}/pdf?token=${browserlessKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html,
          options: { format: "A4", printBackground: true, preferCSSPageSize: true },
        }),
      });
      if (!pdfRes.ok) {
        const text = await pdfRes.text();
        console.error("[generate-memo-pdf] browserless error", pdfRes.status, text);
        return json({ html, omitted, warning: "pdf_render_failed_returning_html" }, 200);
      }
      const buf = new Uint8Array(await pdfRes.arrayBuffer());
      const b64 = base64(buf);
      return json({ pdf_base64: b64, omitted }, 200);
    } catch (err) {
      console.error("[generate-memo-pdf] browserless exception", err);
      return json({ html, omitted, warning: "pdf_render_failed_returning_html" }, 200);
    }
  }

  return json({ html, omitted }, 200);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}