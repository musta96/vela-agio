// Resolves the AI provider config for a given user.
// Reads profile.ai_provider + ai_model, then fetches the matching encrypted
// API key from user_api_keys (if any). Falls back to Lovable AI Gateway.
//
// Returns a config you can use to call an OpenAI-compatible chat/completions
// endpoint. For Lovable (default) and openai/groq/mistral/perplexity, the same
// request shape works. Anthropic and Gemini fall back to Lovable for now and
// surface a notice in `notice`.

import { createClient } from "npm:@supabase/supabase-js@2";

export type ProviderId =
  | "lovable"
  | "openai"
  | "groq"
  | "mistral"
  | "perplexity"
  | "anthropic"
  | "gemini";

export interface AIConfig {
  provider: ProviderId;
  effectiveProvider: ProviderId; // what we actually call (may be 'lovable' fallback)
  model: string;
  baseURL: string;
  headers: Record<string, string>;
  notice?: string; // surfaced to client when we fell back
  source: "user" | "default"; // 'user' if we used the user's BYO key
}

const DEFAULT_MODELS: Record<ProviderId, string> = {
  lovable: "google/gemini-2.5-flash",
  openai: "gpt-4o-mini",
  groq: "llama-3.3-70b-versatile",
  mistral: "mistral-large-latest",
  perplexity: "llama-3.1-sonar-large-128k-online",
  anthropic: "claude-3-5-sonnet-latest",
  gemini: "gemini-2.0-flash",
};

const PROVIDER_TO_KEY: Record<Exclude<ProviderId, "lovable">, string> = {
  openai: "OPENAI_API_KEY",
  groq: "GROQ_API_KEY",
  mistral: "MISTRAL_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

const OPENAI_COMPATIBLE: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  mistral: "https://api.mistral.ai/v1",
  perplexity: "https://api.perplexity.ai",
};

let cachedKey: CryptoKey | null = null;
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const raw = Deno.env.get("APP_ENCRYPTION_KEY");
  if (!raw) throw new Error("APP_ENCRYPTION_KEY not configured");
  const bytes = b64decode(raw);
  cachedKey = await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  return cachedKey;
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

function lovableConfig(model: string): AIConfig {
  return {
    provider: "lovable",
    effectiveProvider: "lovable",
    model,
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY") ?? ""}`,
      "Content-Type": "application/json",
    },
    source: "default",
  };
}

/**
 * Resolve an AI provider config for the given authorization header.
 * If the header is missing or invalid, returns the Lovable default.
 * Never throws — always returns a usable config.
 */
export async function resolveAIConfig(authHeader: string | null): Promise<AIConfig> {
  const fallback = lovableConfig(DEFAULT_MODELS.lovable);
  try {
    if (!authHeader?.startsWith("Bearer ")) return fallback;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return fallback;

    const admin = createClient(SUPABASE_URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile } = await admin
      .from("profiles")
      .select("ai_provider, ai_model")
      .eq("user_id", user.id)
      .maybeSingle();

    const provider = (profile?.ai_provider ?? "lovable") as ProviderId;
    const model = (profile?.ai_model?.trim() || DEFAULT_MODELS[provider] || DEFAULT_MODELS.lovable);

    if (provider === "lovable") return lovableConfig(model);

    // Need user's key
    const keyName = PROVIDER_TO_KEY[provider];
    const { data: row } = await admin
      .from("user_api_keys")
      .select("ciphertext, iv")
      .eq("user_id", user.id)
      .eq("provider", keyName)
      .maybeSingle();
    if (!row) {
      const fb = lovableConfig(DEFAULT_MODELS.lovable);
      fb.notice = `No ${keyName} saved — using default Lovable AI. Add it in Settings to use ${provider}.`;
      return fb;
    }
    const apiKey = await decrypt(row.ciphertext, row.iv);

    // OpenAI-compatible providers
    if (OPENAI_COMPATIBLE[provider]) {
      return {
        provider,
        effectiveProvider: provider,
        model,
        baseURL: OPENAI_COMPATIBLE[provider],
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        source: "user",
      };
    }

    // Anthropic + Gemini not yet adapted — fall back with notice
    const fb = lovableConfig(DEFAULT_MODELS.lovable);
    fb.notice = `Direct ${provider} streaming is coming soon — using default Lovable AI for now.`;
    return fb;
  } catch (e) {
    console.error("resolveAIConfig failed", e);
    return fallback;
  }
}

/**
 * Convenience helper for non-streaming JSON chat completions.
 * Returns the parsed message content.
 */
export async function chatComplete(
  cfg: AIConfig,
  body: Record<string, unknown>,
): Promise<Response> {
  return await fetch(`${cfg.baseURL}/chat/completions`, {
    method: "POST",
    headers: cfg.headers,
    body: JSON.stringify({ model: cfg.model, ...body }),
  });
}