/**
 * RLS regression tests for the security findings fixed on 2026-07-02:
 *   - feature_gate_blocks_missing_select_for_users
 *   - mandate_audit_client_insert_spoofing
 *   - referral_codes_stripe_coupon_exposure
 *
 * Two layers:
 *
 * 1. Schema assertions (always run when psql + DB creds are available):
 *    reads `pg_policies` and verifies the exact policies + predicates we
 *    rely on are still in place. Catches accidental removal or weakening.
 *
 * 2. Behavioural assertions (opt-in via RLS_BEHAVIOURAL=1): runs the SQL
 *    script that flips into `authenticated`/`anon` with faked JWT claims
 *    and asserts the runtime behaviour. Requires a Postgres role that owns
 *    the tables under test (typically `postgres`), which is not available
 *    in the sandbox, so this layer only runs in dedicated CI jobs.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

function hasPsql() {
  const r = spawnSync("psql", ["--version"], { stdio: "ignore" });
  return r.status === 0;
}
function hasDbConn() {
  return Boolean(process.env.SUPABASE_DB_URL || process.env.PGHOST);
}

function psql(sql: string): { stdout: string; status: number | null; stderr: string } {
  const conn = process.env.SUPABASE_DB_URL;
  const args = ["-At", "-F", "|", "-v", "ON_ERROR_STOP=1", "-c", sql];
  if (conn) args.unshift(conn);
  const r = spawnSync("psql", args, { encoding: "utf8" });
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status };
}

function policyRow(table: string, name: string) {
  const r = psql(
    `select cmd, coalesce(qual,''), coalesce(with_check,''), array_to_string(roles,',') ` +
    `from pg_policies where schemaname='public' and tablename='${table}' and policyname='${name}'`,
  );
  if (r.status !== 0) throw new Error(`psql failed: ${r.stderr}`);
  const line = r.stdout.trim().split("\n").filter(Boolean)[0];
  if (!line) return null;
  const [cmd, qual, withCheck, roles] = line.split("|");
  return { cmd, qual, withCheck, roles };
}

const shouldRun = hasPsql() && hasDbConn();
const describeFn = shouldRun ? describe : describe.skip;

describeFn("RLS policy regressions (schema)", () => {
  it("feature_gate_blocks: owner SELECT + admin SELECT + user INSERT", () => {
    const owner = policyRow("feature_gate_blocks", "fgb_user_read_own");
    expect(owner, "fgb_user_read_own SELECT policy is missing").not.toBeNull();
    expect(owner!.cmd).toBe("SELECT");
    expect(owner!.roles).toContain("authenticated");
    expect(owner!.qual.replace(/\s+/g, "")).toBe("(auth.uid()=user_id)");

    const admin = policyRow("feature_gate_blocks", "fgb_admin_read");
    expect(admin, "fgb_admin_read policy is missing").not.toBeNull();
    expect(admin!.qual).toContain("has_role(auth.uid(), 'admin'::app_role)");

    const ins = policyRow("feature_gate_blocks", "fgb_user_insert");
    expect(ins, "fgb_user_insert policy is missing").not.toBeNull();
    expect(ins!.cmd).toBe("INSERT");
    expect(ins!.withCheck.replace(/\s+/g, "")).toBe("(auth.uid()=user_id)");
  });

  it("mandate_audit: INSERT policy requires actor=self AND (self-audit OR active consent)", () => {
    // The insecure policy allowed any authenticated user to insert with only
    // actor_id = auth.uid(). Make sure it's gone.
    const old = policyRow("mandate_audit", "Actors insert their own audit rows");
    expect(old, "the permissive mandate_audit INSERT policy must be removed").toBeNull();

    const fixed = policyRow("mandate_audit", "Actors insert audit rows for real relationships");
    expect(fixed, "hardened mandate_audit INSERT policy is missing").not.toBeNull();
    expect(fixed!.cmd).toBe("INSERT");
    const wc = fixed!.withCheck;
    // Must still bind actor to the caller...
    expect(wc).toContain("auth.uid() = actor_id");
    // ...and must gate cross-user inserts on an active consent row.
    expect(wc).toContain("advisory_consents");
    expect(wc).toContain("granted_to");
    expect(wc).toContain("revoked_at IS NULL");
  });

  it("referral_codes: broad authenticated SELECT is gone; admin policy remains", () => {
    const broad = policyRow("referral_codes", "referral_codes_authenticated_can_read_active");
    expect(broad, "broad authenticated SELECT on referral_codes must be removed (stripe_coupon_id leak)").toBeNull();

    const admin = policyRow("referral_codes", "admins manage referral_codes");
    expect(admin, "admin policy on referral_codes is missing").not.toBeNull();
    expect(admin!.qual).toContain("has_role(auth.uid(), 'admin'::app_role)");

    // Sanity: RLS is still enabled on the table.
    const rls = psql(`select relrowsecurity from pg_class where oid = 'public.referral_codes'::regclass`);
    expect(rls.stdout.trim()).toBe("t");
  });
});

// Optional behavioural layer: requires a Postgres role that owns the tables
// (drops FKs on a rolled-back transaction and impersonates authenticated/anon).
const runBehavioural = shouldRun && process.env.RLS_BEHAVIOURAL === "1";
(runBehavioural ? describe : describe.skip)("RLS behavioural regressions", () => {
  it("SQL script asserts runtime enforcement across roles", () => {
    const script = resolve(process.cwd(), "supabase/tests/rls/security_regressions.sql");
    expect(existsSync(script)).toBe(true);
    const conn = process.env.SUPABASE_DB_URL;
    const args = ["-v", "ON_ERROR_STOP=1", "-f", script];
    if (conn) args.unshift(conn);
    const r = spawnSync("psql", args, {
      encoding: "utf8",
      env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" },
    });
    const combined = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    if (r.status !== 0) throw new Error(`RLS regression script failed:\n${combined}`);
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
    expect(combined).toContain("All RLS regression checks passed.");
  }, 30_000);
});