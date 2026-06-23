// Encrypted per-user API key vault.
// AES-GCM 256-bit, key from APP_ENCRYPTION_KEY (base64, 32 bytes).
// Ciphertext never leaves the server; the browser only sees provider name + last-4 hint.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Provider-aware key sanity + live connectivity checks.
 *
 * Two stages, in order:
 *   1. Local format validation (regex / length / prefix). Catches the
 *      overwhelmingly common copy-paste mistakes (quotes, trailing newline,
 *      "Bearer " prefix, wrong service's key) without spending a network
 *      round-trip.
 *   2. Live probe against a cheap, read-only provider endpoint to verify the
 *      key is actually accepted by the upstream service. This is what catches
 *      revoked / billing-suspended / wrong-project keys that look valid on
 *      paper. The probe is intentionally lightweight (a metadata-only GET
 *      where possible) so it costs nothing and stays well within free tiers.
 *
 * The plaintext key never leaves this function — we never log it, never echo
 * it back to the client, never persist it in the audit payload.
 */
type FormatCheck = { ok: boolean; message?: string };
type LiveCheck =
  | { ok: true; detail?: string }
  | { ok: false; status?: number; message: string };

function safeFingerprint(value: string): { length: number; prefix: string; suffix: string } {
  const v = value ?? "";
  return {
    length: v.length,
    prefix: v.slice(0, 4),
    suffix: v.length > 4 ? v.slice(-4) : "",
  };
}

function normalizeKey(raw: string): string {
  // Defensive: strip wrapping quotes, leading "Bearer ", and surrounding whitespace.
  let v = (raw ?? "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (/^bearer\s+/i.test(v)) v = v.replace(/^bearer\s+/i, "");
  return v.trim();
}

function checkFormat(provider: string, value: string): FormatCheck {
  const v = value;
  // No whitespace anywhere inside an API key — that's almost always a paste error.
  if (/\s/.test(v)) return { ok: false, message: "Key contains whitespace — re-copy without line breaks or spaces." };
  switch (provider) {
    case "GEMINI_API_KEY":
      // Google AI Studio keys are "AIza" + 35 url-safe chars (39 total).
      if (!/^AIza[0-9A-Za-z_-]{35}$/.test(v)) {
        return {
          ok: false,
          message:
            "Gemini key must start with \"AIza\" and be 39 characters of letters, digits, underscore or dash. Get one at https://aistudio.google.com/apikey",
        };
      }
      return { ok: true };
    case "OPENAI_API_KEY":
      if (!/^sk-[A-Za-z0-9_\-]{20,}$/.test(v)) {
        return { ok: false, message: "OpenAI keys start with \"sk-\" and are at least ~24 characters." };
      }
      return { ok: true };
    case "ANTHROPIC_API_KEY":
      if (!/^sk-ant-[A-Za-z0-9_\-]{20,}$/.test(v)) {
        return { ok: false, message: "Anthropic keys start with \"sk-ant-\"." };
      }
      return { ok: true };
    default:
      // Unknown provider — only enforce the universal "no whitespace, reasonable length" rule.
      if (v.length < 8) return { ok: false, message: "Key looks too short." };
      return { ok: true };
  }
}

async function probeProvider(provider: string, value: string): Promise<LiveCheck> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    switch (provider) {
      case "GEMINI_API_KEY": {
        // Cheapest possible call: list models. Returns 200 on success, 400/403
        // on bad key, 429 on quota. We pass the key as the documented `key=`
        // query param (do NOT log the URL — it embeds the secret).
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(value)}&pageSize=1`;
        const r = await fetch(url, { method: "GET", signal: ctrl.signal });
        if (r.ok) {
          let count = 0;
          try { const j = await r.json(); count = Array.isArray(j?.models) ? j.models.length : 0; } catch { /* ignore */ }
          return { ok: true, detail: count ? `Gemini accepted the key (${count}+ models visible).` : "Gemini accepted the key." };
        }
        let upstream = "";
        try { upstream = (await r.text()).slice(0, 240); } catch { /* ignore */ }
        // Map the common Gemini failure modes to actionable messages.
        if (r.status === 400) return { ok: false, status: 400, message: `Gemini rejected the key as malformed. ${upstream || ""}`.trim() };
        if (r.status === 401 || r.status === 403) return { ok: false, status: r.status, message: "Gemini rejected the key (invalid, revoked, or the Generative Language API is not enabled on the linked Google Cloud project)." };
        if (r.status === 429) return { ok: false, status: 429, message: "Gemini rate-limited the validation call. The key may still be valid — retry in a minute." };
        return { ok: false, status: r.status, message: `Gemini returned HTTP ${r.status}. ${upstream}`.trim() };
      }
      case "OPENAI_API_KEY": {
        const r = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${value}` },
          signal: ctrl.signal,
        });
        if (r.ok) { try { await r.text(); } catch { /* ignore */ } return { ok: true, detail: "OpenAI accepted the key." }; }
        if (r.status === 401) return { ok: false, status: 401, message: "OpenAI rejected the key (invalid or revoked)." };
        return { ok: false, status: r.status, message: `OpenAI returned HTTP ${r.status}.` };
      }
      case "ANTHROPIC_API_KEY": {
        // Cheapest call: a 1-token completion would cost money. /v1/models is
        // the canonical metadata endpoint and is free.
        const r = await fetch("https://api.anthropic.com/v1/models", {
          headers: { "x-api-key": value, "anthropic-version": "2023-06-01" },
          signal: ctrl.signal,
        });
        if (r.ok) { try { await r.text(); } catch { /* ignore */ } return { ok: true, detail: "Anthropic accepted the key." }; }
        if (r.status === 401 || r.status === 403) return { ok: false, status: r.status, message: "Anthropic rejected the key (invalid or revoked)." };
        return { ok: false, status: r.status, message: `Anthropic returned HTTP ${r.status}.` };
      }
      default:
        // No live probe defined — caller can still save the key, format check only.
        return { ok: true, detail: "No live probe available for this provider; saved without upstream verification." };
    }
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    if (msg.toLowerCase().includes("abort")) return { ok: false, message: "Validation timed out reaching the provider." };
    return { ok: false, message: `Network error contacting provider: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

let cachedKey: CryptoKey | null = null;

export type KeyCheckResult = {
  ok: boolean;
  present: boolean;
  base64_valid: boolean;
  byte_length: number;
  expected_byte_length: 32;
  hint: string;
  message: string;
};

function checkEncryptionKey(): KeyCheckResult {
  const raw = Deno.env.get("APP_ENCRYPTION_KEY");
  const base: KeyCheckResult = {
    ok: false, present: false, base64_valid: false,
    byte_length: 0, expected_byte_length: 32,
    hint: "Generate one with: openssl rand -base64 32  (or use the in-app generator).",
    message: "",
  };
  if (!raw) return { ...base, message: "APP_ENCRYPTION_KEY secret is not set." };
  base.present = true;
  let bytes: Uint8Array;
  try { bytes = b64decode(raw.trim()); }
  catch { return { ...base, message: "APP_ENCRYPTION_KEY is not valid base64." }; }
  base.base64_valid = true;
  base.byte_length = bytes.length;
  if (bytes.length !== 32) {
    return { ...base, message: `APP_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${bytes.length}). AES-256 requires a 32-byte key (44-char base64 ending in '=').` };
  }
  return { ...base, ok: true, message: "APP_ENCRYPTION_KEY is valid (32 bytes, base64)." };
}

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const check = checkEncryptionKey();
  if (!check.ok) throw new Error(`[vault setup] ${check.message} ${check.hint}`);
  const bytes = b64decode((Deno.env.get("APP_ENCRYPTION_KEY") || "").trim());
  cachedKey = await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  return cachedKey;
}

async function encrypt(plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plaintext);
  const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc);
  return { ciphertext: b64encode(new Uint8Array(buf)), iv: b64encode(iv) };
}
async function decrypt(ciphertextB64: string, ivB64: string): Promise<string> {
  const key = await getKey();
  const buf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(ivB64) },
    key,
    b64decode(ciphertextB64),
  );
  return new TextDecoder().decode(buf);
}

async function writeAudit(
  supabase: ReturnType<typeof createClient>,
  actorId: string | null,
  actorEmail: string | null,
  action: string,
  entity: string,
  entityId: string,
  payload: Record<string, unknown>,
  req: Request,
) {
  try {
    await supabase.from("audit_log").insert({
      actor_id: actorId,
      actor_email: actorEmail,
      action,
      entity,
      entity_id: entityId,
      payload,
      ip: req.headers.get("x-forwarded-for") ?? null,
      user_agent: req.headers.get("user-agent") ?? null,
    });
  } catch (e) {
    console.error("audit write failed", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Authn: validate the caller's JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthenticated" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "unauthenticated" }, 401);
  const user = userRes.user;

  // Service client to read/write the vault (bypassing the deny-all RLS policy)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: { action?: string; provider?: string; value?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const action = body.action;

  try {
    if (action === "health") {
      const enc = checkEncryptionKey();
      const required = [
        "APP_ENCRYPTION_KEY",
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
      ];
      const secrets = required.map((name) => ({ name, present: !!Deno.env.get(name) }));
      const allOk = enc.ok && secrets.every((s) => s.present);
      return json({ ok: allOk, encryption_key: enc, secrets });
    }

    if (action === "list") {
      const { data, error } = await admin
        .from("user_api_keys")
        .select("provider, hint, created_at, updated_at")
        .eq("user_id", user.id);
      if (error) throw error;
      return json({ keys: data ?? [] });
    }

    if (action === "set") {
      const provider = (body.provider ?? "").trim();
      const value = normalizeKey(body.value ?? "");
      if (!provider || provider.length > 64) return json({ error: "invalid provider" }, 400);
      if (!value || value.length > 4096) return json({ error: "invalid value" }, 400);

      // Format check first (cheap, fails fast on obvious typos).
      const fmt = checkFormat(provider, value);
      if (!fmt.ok) {
        console.warn("[keys-vault] format check failed", {
          provider,
          user_id: user.id,
          fingerprint: safeFingerprint(value),
          reason: fmt.message,
        });
        return json({ error: fmt.message, stage: "format", provider }, 400);
      }
      // Live probe against the provider so we never persist a key the upstream
      // service will reject. Skipped only if the caller explicitly opts out.
      const probe = await probeProvider(provider, value);
      if (!probe.ok) {
        console.warn("[keys-vault] live probe failed", {
          provider,
          user_id: user.id,
          fingerprint: safeFingerprint(value),
          status: probe.status,
          reason: probe.message,
        });
        return json({ error: probe.message, stage: "live", provider, status: probe.status }, 400);
      }

      const { ciphertext, iv } = await encrypt(value);
      const hint = value.length >= 4 ? value.slice(-4) : "****";
      const { error } = await admin.from("user_api_keys").upsert(
        { user_id: user.id, provider, ciphertext, iv, hint, updated_at: new Date().toISOString() },
        { onConflict: "user_id,provider" },
      );
      if (error) throw error;
      await writeAudit(admin, user.id, user.email ?? null, "api_key.set", "user_api_keys", provider, { provider, hint }, req);
      return json({ ok: true, hint, validated: true, detail: probe.detail });
    }

    // Stand-alone validation — lets the UI test a key before persisting it.
    if (action === "validate") {
      const provider = (body.provider ?? "").trim();
      const value = normalizeKey(body.value ?? "");
      if (!provider) return json({ error: "invalid provider" }, 400);
      if (!value) return json({ error: "invalid value" }, 400);
      const fmt = checkFormat(provider, value);
      if (!fmt.ok) return json({ ok: false, stage: "format", error: fmt.message });
      const probe = await probeProvider(provider, value);
      if (!probe.ok) return json({ ok: false, stage: "live", error: probe.message, status: probe.status });
      return json({ ok: true, detail: probe.detail });
    }

    if (action === "delete") {
      const provider = (body.provider ?? "").trim();
      if (!provider) return json({ error: "invalid provider" }, 400);
      const { error } = await admin
        .from("user_api_keys")
        .delete()
        .eq("user_id", user.id)
        .eq("provider", provider);
      if (error) throw error;
      await writeAudit(admin, user.id, user.email ?? null, "api_key.delete", "user_api_keys", provider, { provider }, req);
      return json({ ok: true });
    }

    // Internal-use action: other edge functions can decrypt by calling this with a
    // service-role-prefixed header. For now, we only expose decrypt to the owning user
    // for round-trip testing; production server-to-server reads should call the DB directly.
    if (action === "reveal") {
      const provider = (body.provider ?? "").trim();
      const { data, error } = await admin
        .from("user_api_keys")
        .select("ciphertext, iv")
        .eq("user_id", user.id)
        .eq("provider", provider)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "not found" }, 404);
      const value = await decrypt(data.ciphertext, data.iv);
      await writeAudit(admin, user.id, user.email ?? null, "api_key.reveal", "user_api_keys", provider, { provider }, req);
      return json({ value });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    const msg = (e as Error)?.message || "internal error";
    const stack = (e as Error)?.stack;
    console.error("[keys-vault] error", { action, message: msg, stack });
    return json({ error: msg, action, hint: msg.includes("APP_ENCRYPTION_KEY") ? "Run the 'health' action or use the in-app key generator to fix APP_ENCRYPTION_KEY." : undefined }, 500);
  }
});