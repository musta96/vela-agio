const KEY = "vela.friend-invite";
const SESSION_KEY = "vela.friend-visit-session";
export type PendingFriendInvite = { receipt: string; capturedAt: number };
export function validInviteToken(token: string): boolean { return /^[a-f0-9]{32}$/.test(token); }
export function referralConversion(visits: number, signups: number): number {
  return visits > 0 ? Math.min(100, Math.max(0, signups / visits * 100)) : 0;
}
export function getPendingFriendInvite(): PendingFriendInvite | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) || "null") as PendingFriendInvite | null;
    if (!value || typeof value.receipt !== "string" || !Number.isFinite(value.capturedAt) || Date.now() - value.capturedAt > 30 * 86400000) return null;
    return value;
  } catch { return null; }
}
export function saveFriendInvite(receipt: string) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ receipt, capturedAt: Date.now() })); } catch {}
}
export function clearFriendInvite() { try { sessionStorage.removeItem(KEY); } catch {} }
export function friendVisitSession(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID(); sessionStorage.setItem(SESSION_KEY, id); return id;
  } catch { return crypto.randomUUID(); }
}