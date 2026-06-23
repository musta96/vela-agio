/**
 * Encode / decode shareable `?quant=` links for the Backtest Quantitative
 * Analysis panel. Carries panel settings plus the basket so opening the URL
 * rehydrates both the holdings and the analysis configuration on
 * `/backtest`.
 *
 * Format: base64url-encoded JSON, versioned, compact keys.
 */

export interface QuantShareHolding {
  symbol: string;
  weight: number;
  name?: string;
}

export interface QuantShareSettings {
  horizonDays: number;
  paths: number;
  confidences: number[];
}

export interface QuantSharePayload {
  v: number;
  s: QuantShareSettings;
  h?: QuantShareHolding[];
  range?: string;
  strategy?: string;
}

const VERSION = 1;

function b64urlEncode(s: string): string {
  if (typeof btoa === "undefined") return s;
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(s: string): string {
  if (typeof atob === "undefined") return s;
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  try { return decodeURIComponent(escape(atob(padded))); } catch { return ""; }
}

export function encodeQuantParam(payload: Omit<QuantSharePayload, "v">): string {
  return b64urlEncode(JSON.stringify({ v: VERSION, ...payload }));
}

export function decodeQuantParam(token: string | null | undefined): QuantSharePayload | null {
  if (!token) return null;
  try {
    const raw = b64urlDecode(token);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuantSharePayload;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.s || typeof parsed.s !== "object") return null;
    // Defensive defaults.
    parsed.s.horizonDays = Math.max(5, Math.min(1260, Math.round(Number(parsed.s.horizonDays) || 252)));
    parsed.s.paths = Math.max(100, Math.min(10000, Math.round(Number(parsed.s.paths) || 1500)));
    parsed.s.confidences = Array.isArray(parsed.s.confidences) && parsed.s.confidences.length
      ? parsed.s.confidences.filter((c) => c > 0.5 && c < 1)
      : [0.95, 0.99];
    if (Array.isArray(parsed.h)) {
      parsed.h = parsed.h
        .filter((h): h is QuantShareHolding => !!h && typeof h.symbol === "string")
        .map((h) => ({ symbol: h.symbol, name: h.name, weight: Math.max(0, Number(h.weight) || 0) }));
    }
    return parsed;
  } catch {
    return null;
  }
}

export function buildQuantShareUrl(payload: Omit<QuantSharePayload, "v">): string | null {
  if (typeof window === "undefined") return null;
  const token = encodeQuantParam(payload);
  const url = new URL(window.location.href);
  url.searchParams.set("quant", token);
  return url.toString();
}