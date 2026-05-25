/**
 * Cookie/consent management. CMP-style with 3 categories.
 * GDPR + Italian Garante compliant: analytics & marketing default OFF, explicit opt-in required.
 */

export type ConsentCategory = "essential" | "analytics" | "marketing";

export interface ConsentState {
  essential: true; // always true, cannot be disabled
  analytics: boolean;
  marketing: boolean;
  decidedAt: string; // ISO timestamp
  version: number;
}

const STORAGE_KEY = "vela_consent";
const CURRENT_VERSION = 1;
const OPEN_EVENT = "vela:open-consent";
const CHANGE_EVENT = "vela:consent-changed";

export function getConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (parsed.version !== CURRENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setConsent(partial: { analytics: boolean; marketing: boolean }) {
  const next: ConsentState = {
    essential: true,
    analytics: partial.analytics,
    marketing: partial.marketing,
    decidedAt: new Date().toISOString(),
    version: CURRENT_VERSION,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  return next;
}

export function acceptAll() {
  return setConsent({ analytics: true, marketing: true });
}

export function rejectAll() {
  return setConsent({ analytics: false, marketing: false });
}

export function openCookieSettings() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export const CONSENT_EVENTS = { OPEN_EVENT, CHANGE_EVENT };

export function hasConsented(category: ConsentCategory): boolean {
  if (category === "essential") return true;
  const c = getConsent();
  return c ? c[category] === true : false;
}