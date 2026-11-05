import { beforeEach, describe, expect, it } from "vitest";
import { validInviteToken, referralConversion, friendVisitSession, saveFriendInvite, getPendingFriendInvite, clearFriendInvite } from "@/lib/friendInvites";
beforeEach(() => sessionStorage.clear());
describe("Personal friend invitations", () => {
  it("requires a separate 128-bit opaque token, not promotion codes", () => {
    expect(validInviteToken("a".repeat(32))).toBe(true);
    expect(validInviteToken("BETA2026")).toBe(false);
  });
  it("calculates signup conversion from tracked visits", () => { expect(referralConversion(20, 5)).toBe(25); expect(referralConversion(0, 0)).toBe(0); });
  it("deduplicates repeat visits within a tab", () => { expect(friendVisitSession()).toBe(friendVisitSession()); });
  it("retains the receipt through signup and clears it after attribution", () => { saveFriendInvite("receipt"); expect(getPendingFriendInvite()?.receipt).toBe("receipt"); clearFriendInvite(); expect(getPendingFriendInvite()).toBeNull(); });
  it("expires attribution after 30 days", () => { sessionStorage.setItem("vela.friend-invite", JSON.stringify({ receipt: "receipt", capturedAt: Date.now() - 31 * 86400000 })); expect(getPendingFriendInvite()).toBeNull(); });
});