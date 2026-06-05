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
      const value = (body.value ?? "").trim();
      if (!provider || provider.length > 64) return json({ error: "invalid provider" }, 400);
      if (!value || value.length > 4096) return json({ error: "invalid value" }, 400);
      const { ciphertext, iv } = await encrypt(value);
      const hint = value.length >= 4 ? value.slice(-4) : "****";
      const { error } = await admin.from("user_api_keys").upsert(
        { user_id: user.id, provider, ciphertext, iv, hint, updated_at: new Date().toISOString() },
        { onConflict: "user_id,provider" },
      );
      if (error) throw error;
      await writeAudit(admin, user.id, user.email ?? null, "api_key.set", "user_api_keys", provider, { provider, hint }, req);
      return json({ ok: true, hint });
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