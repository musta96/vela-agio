// Resolves the AI provider config for a given user.
// Reads profile.ai_provider + ai_model, then fetches the matching encrypted
// API key from user_api_keys (if any). Falls back to Lovable AI Gateway.
//
// Returns a config you can use to call an OpenAI-compatible chat/completions
// endpoint. For Lovable (default) and BYO OpenAI-compatible providers, the same
// request shape works. If a user selected a BYO provider but has not saved the
// matching key, we fail closed instead of silently spending Lovable AI credits.

import { createClient } from "npm:@supabase/supabase-js@2";

export type ProviderId =
  | "lovable"
  | "openai"
  | "groq"
  | "mistral"
  | "perplexity"
  | "openrouter"
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
  lovable: "google/gemini-3-flash-preview",
  openai: "gpt-5-mini",
  groq: "llama-3.3-70b-versatile",
  mistral: "mistral-large-latest",
  perplexity: "llama-3.1-sonar-large-128k-online",
  openrouter: "openai/gpt-5-mini",
  anthropic: "claude-sonnet-4-6",
  gemini: "gemini-2.5-flash",
};

const PROVIDER_TO_KEY: Record<Exclude<ProviderId, "lovable">, string> = {
  openai: "OPENAI_API_KEY",
  groq: "GROQ_API_KEY",
  mistral: "MISTRAL_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

const OPENAI_COMPATIBLE: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  mistral: "https://api.mistral.ai/v1",
  perplexity: "https://api.perplexity.ai",
  openrouter: "https://openrouter.ai/api/v1",
  anthropic: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
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
      "Lovable-API-Key": Deno.env.get("LOVABLE_API_KEY") ?? "",
      "X-Lovable-AIG-SDK": "direct-fetch",
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
    if (!row) throw new Error(`Selected AI provider ${provider} requires ${keyName}. Add it in Settings → Connections, or switch back to Lovable AI.`);
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

    throw new Error(`Unsupported AI provider: ${provider}`);
  } catch (e) {
    console.error("resolveAIConfig failed", e);
    throw e;
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

/**
 * Per-provider fallback model chains. When the primary model returns 429
 * (rate-limited) we retry the same request against the next model in the
 * chain. The first entry is the "primary" placeholder — the caller's
 * configured model is always tried first regardless of what's listed here.
 */
const FALLBACK_MODELS: Partial<Record<ProviderId, string[]>> = {
  lovable: [
    "google/gemini-2.5-flash",
    "google/gemini-2.5-flash-lite",
    "google/gemini-3-flash-preview",
  ],
  gemini: [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
  ],
  openrouter: [
    "openai/gpt-4o-mini",
    "google/gemini-flash-1.5",
  ],
};

export interface ChatWithFallbackResult {
  response: Response;
  modelUsed: string;
  providerUsed: ProviderId;
  attempts: { provider: ProviderId; model: string; status: number }[];
  switchedProvider: boolean;
  notice?: string;
}

/**
 * POST chat/completions with automatic fallback on 429 (and 5xx).
 *
 * Strategy:
 *  1. Try the caller's configured model.
 *  2. On 429/5xx, retry the same request against the next model in the
 *     provider's fallback chain (skipping duplicates).
 *  3. If the caller is on BYO and every BYO model 429s, escape to the
 *     Lovable gateway using `google/gemini-2.5-flash` as a final fallback
 *     (only when LOVABLE_API_KEY is configured).
 *
 * Returns the first non-429/5xx Response. Body/headers are NOT consumed.
 */
export async function chatWithFallback(
  cfg: AIConfig,
  body: Record<string, unknown>,
): Promise<ChatWithFallbackResult> {
  const attempts: { provider: ProviderId; model: string; status: number }[] = [];
  const shouldRetry = (status: number) => status === 429 || (status >= 500 && status <= 599);

  const primaryChain = [
    cfg.model,
    ...(FALLBACK_MODELS[cfg.provider] ?? []).filter((m) => m !== cfg.model),
  ];

  let lastResponse: Response | null = null;
  for (const model of primaryChain) {
    const res = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: "POST",
      headers: cfg.headers,
      body: JSON.stringify({ ...body, model }),
    });
    attempts.push({ provider: cfg.provider, model, status: res.status });
    if (!shouldRetry(res.status)) {
      return {
        response: res,
        modelUsed: model,
        providerUsed: cfg.provider,
        attempts,
        switchedProvider: model !== cfg.model,
        notice: model !== cfg.model
          ? `Primary model rate-limited; switched to ${model}.`
          : undefined,
      };
    }
    // Drain body so we don't leak the connection before retrying.
    try { await res.body?.cancel(); } catch { /* ignore */ }
    lastResponse = res;
  }

  // Cross-provider escape: BYO → Lovable gateway as last resort.
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (cfg.provider !== "lovable" && lovableKey) {
    const lovable = lovableConfig("google/gemini-2.5-flash");
    for (const model of ["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite"]) {
      const res = await fetch(`${lovable.baseURL}/chat/completions`, {
        method: "POST",
        headers: lovable.headers,
        body: JSON.stringify({ ...body, model }),
      });
      attempts.push({ provider: "lovable", model, status: res.status });
      if (!shouldRetry(res.status)) {
        return {
          response: res,
          modelUsed: model,
          providerUsed: "lovable",
          attempts,
          switchedProvider: true,
          notice: `Your AI provider was rate-limited; used Lovable AI (${model}) as a fallback.`,
        };
      }
      try { await res.body?.cancel(); } catch { /* ignore */ }
      lastResponse = res;
    }
  }

  // All attempts exhausted — return the last response so callers can surface it.
  return {
    response: lastResponse!,
    modelUsed: attempts[attempts.length - 1]?.model ?? cfg.model,
    providerUsed: (attempts[attempts.length - 1]?.provider ?? cfg.provider) as ProviderId,
    attempts,
    switchedProvider: false,
  };
}