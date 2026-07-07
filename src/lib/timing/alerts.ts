import type { TimingResult, TimingDirection } from "./schema";

export interface AlertPrefs {
  enabled: boolean;
  onBuy: boolean;
  onAvoid: boolean;
  /** Only fire if at least one catalyst event within lookahead window falls on/before this many days. */
  windowDays: number;
  /** Also send a browser (system) notification if permission granted. */
  browserNotify: boolean;
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = {
  enabled: false,
  onBuy: true,
  onAvoid: true,
  windowDays: 30,
  browserNotify: true,
};

export function alertPrefsKey(symbol: string) { return `timing.alerts.${symbol.toUpperCase()}`; }
export function lastVerdictKey(symbol: string, lookahead: number) {
  return `timing.lastVerdict.${symbol.toUpperCase()}.${lookahead}`;
}

export function readPrefs(symbol: string): AlertPrefs {
  if (typeof window === "undefined") return DEFAULT_ALERT_PREFS;
  try {
    const raw = window.localStorage.getItem(alertPrefsKey(symbol));
    if (!raw) return DEFAULT_ALERT_PREFS;
    return { ...DEFAULT_ALERT_PREFS, ...JSON.parse(raw) } as AlertPrefs;
  } catch { return DEFAULT_ALERT_PREFS; }
}

export function writePrefs(symbol: string, prefs: AlertPrefs) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(alertPrefsKey(symbol), JSON.stringify(prefs));
}

export function readLastVerdict(symbol: string, lookahead: number): TimingDirection | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(lastVerdictKey(symbol, lookahead));
  return v === "buy" || v === "avoid" || v === "wait" ? v : null;
}

export function writeLastVerdict(symbol: string, lookahead: number, verdict: TimingDirection) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(lastVerdictKey(symbol, lookahead), verdict);
}

/** Decide whether a fresh timing result should fire an alert for the user. */
export function shouldFireAlert(
  prev: TimingDirection | null,
  next: TimingResult,
  prefs: AlertPrefs,
): { fire: boolean; reason: string } {
  if (!prefs.enabled) return { fire: false, reason: "alerts disabled" };
  if (prev === next.verdict) return { fire: false, reason: "verdict unchanged" };
  if (next.verdict === "buy" && !prefs.onBuy) return { fire: false, reason: "buy alerts off" };
  if (next.verdict === "avoid" && !prefs.onAvoid) return { fire: false, reason: "avoid alerts off" };
  if (next.verdict === "wait") return { fire: false, reason: "wait verdict never alerts" };
  const catalysts = (next.events ?? []).filter((e) => e.daysUntil >= 0 && e.daysUntil <= prefs.windowDays);
  if (catalysts.length === 0) return { fire: false, reason: "no catalyst inside window" };
  return { fire: true, reason: `${catalysts.length} catalyst(s) within ${prefs.windowDays}d` };
}

export async function requestBrowserPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted" || Notification.permission === "denied") return Notification.permission;
  try { return await Notification.requestPermission(); } catch { return "denied"; }
}

export function fireBrowserNotification(symbol: string, verdict: TimingDirection, headline: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(`${symbol}: verdict → ${verdict.toUpperCase()}`, {
      body: headline,
      tag: `timing-${symbol}-${verdict}`,
    });
  } catch { /* noop */ }
}