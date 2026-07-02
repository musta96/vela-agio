import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * RLS regression tests for the security findings fixed on 2026-07-02:
 *   - feature_gate_blocks_missing_select_for_users
 *   - mandate_audit_client_insert_spoofing
 *   - referral_codes_stripe_coupon_exposure
 *
 * Delegates to the SQL script at supabase/tests/rls/security_regressions.sql,
 * which flips into the `authenticated`/`anon` Postgres roles with faked JWT
 * claims and asserts each policy behaves correctly. The script rolls back at
 * the end so it leaves no state behind.
 *
 * Skipped locally when `psql` or `SUPABASE_DB_URL` (or PG* env vars) are not
 * available. CI provides the Supabase pooler URL as `SUPABASE_DB_URL`.
 */

function hasPsql() {
  const r = spawnSync("psql", ["--version"], { stdio: "ignore" });
  return r.status === 0;
}
function hasDbConn() {
  // Require the explicit superuser URL (CI provides it). The sandbox's
  // PG* env vars point at a limited role that can't ALTER/DROP the tables
  // under test, so we don't attempt it there.
  return Boolean(process.env.SUPABASE_DB_URL);
}

const shouldRun = hasPsql() && hasDbConn();
const describeFn = shouldRun ? describe : describe.skip;

describeFn("RLS regressions", () => {
  it("policies still enforce ownership / consent / admin-only access", () => {
    const script = resolve(process.cwd(), "supabase/tests/rls/security_regressions.sql");
    expect(existsSync(script), "regression SQL script must exist").toBe(true);

    const conn = process.env.SUPABASE_DB_URL;
    const args = ["-v", "ON_ERROR_STOP=1", "-f", script];
    if (conn) args.unshift(conn);

    const result = spawnSync("psql", args, {
      encoding: "utf8",
      env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" },
    });

    const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    if (result.status !== 0) {
      throw new Error(`RLS regression script failed:\n${combined}`);
    }
    expect(combined).toContain("All RLS regression checks passed.");
    // Every named case should have logged a PASS notice.
    for (const marker of [
      "PASS feature_gate_blocks: owner-only SELECT",
      "PASS feature_gate_blocks: admin SELECT",
      "PASS mandate_audit: self-audit allowed",
      "PASS mandate_audit: forged insert blocked",
      "PASS mandate_audit: insert allowed once consent exists",
      "PASS referral_codes: hidden from anon",
      "PASS referral_codes: hidden from authenticated non-admin",
      "PASS lookup_referral_code: still resolves for regular users",
      "PASS referral_codes: visible to admin",
    ]) {
      expect(combined, `missing PASS marker: ${marker}`).toContain(marker);
    }
  }, 30_000);
});