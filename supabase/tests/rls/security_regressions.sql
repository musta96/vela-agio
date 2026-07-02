-- RLS regression tests for the security findings fixed on 2026-07-02:
--   * feature_gate_blocks_missing_select_for_users
--   * mandate_audit_client_insert_spoofing
--   * referral_codes_stripe_coupon_exposure
--
-- Runs inside a single transaction and ROLLBACKs at the end so it leaves
-- no state behind. Must be executed as a role that can bypass RLS while
-- seeding (e.g. `postgres`) — the tests themselves flip into the
-- `authenticated` role with faked JWT claims to exercise the policies.
--
-- Run locally:   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls/security_regressions.sql
-- Or via CI:     bun run test:rls

\set ON_ERROR_STOP on
\set QUIET on
BEGIN;
SET LOCAL client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- Seed: two fake users, one admin. We insert into auth.users directly because
-- feature_gate_blocks / user_roles have FKs into it. The whole run is rolled
-- back, so nothing survives past this transaction.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_user_a uuid := '11111111-1111-1111-1111-111111111111';
  v_user_b uuid := '22222222-2222-2222-2222-222222222222';
  v_admin  uuid := '33333333-3333-3333-3333-333333333333';
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES
    (v_user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-a@test.local', '', now(), now(), now()),
    (v_user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-b@test.local', '', now(), now(), now()),
    (v_admin,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-admin@test.local', '', now(), now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_admin, 'admin'::app_role) ON CONFLICT DO NOTHING;

  INSERT INTO public.feature_gate_blocks (user_id, feature_key) VALUES
    (v_user_a, 'test.rls.a'),
    (v_user_b, 'test.rls.b');

  INSERT INTO public.referral_codes (code, kind, stripe_coupon_id, active)
  VALUES ('RLSTEST-EXPOSE', 'discount', 'coupon_secret_do_not_leak', true);
END $$;

-- ---------------------------------------------------------------------------
-- Helpers to flip identity for the current transaction.
-- ---------------------------------------------------------------------------
\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'
\set admin  '33333333-3333-3333-3333-333333333333'

-- ===========================================================================
-- 1. feature_gate_blocks
--    - user A sees only own row
--    - user A cannot see user B's row
--    - admin sees both rows
-- ===========================================================================
SAVEPOINT case_fgb_owner_read;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE own_count int; other_count int;
BEGIN
  SELECT count(*) INTO own_count   FROM public.feature_gate_blocks WHERE feature_key = 'test.rls.a';
  SELECT count(*) INTO other_count FROM public.feature_gate_blocks WHERE feature_key = 'test.rls.b';
  IF own_count <> 1  THEN RAISE EXCEPTION 'FAIL: feature_gate_blocks — user A should see own row (got %)', own_count; END IF;
  IF other_count <> 0 THEN RAISE EXCEPTION 'FAIL: feature_gate_blocks — user A leaked user B rows (got %)', other_count; END IF;
  RAISE NOTICE 'PASS: feature_gate_blocks owner-only SELECT';
END $$;
RESET ROLE;
RESET request.jwt.claims;

SAVEPOINT case_fgb_admin_read;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
DO $$
DECLARE all_count int;
BEGIN
  SELECT count(*) INTO all_count FROM public.feature_gate_blocks WHERE feature_key LIKE 'test.rls.%';
  IF all_count <> 2 THEN RAISE EXCEPTION 'FAIL: feature_gate_blocks — admin should see both rows (got %)', all_count; END IF;
  RAISE NOTICE 'PASS: feature_gate_blocks admin SELECT';
END $$;
RESET ROLE;
RESET request.jwt.claims;

-- ===========================================================================
-- 2. mandate_audit
--    - self-audit (actor = client) succeeds
--    - forging against another user with no consent is blocked
--    - forging with a valid consent succeeds
-- ===========================================================================
SAVEPOINT case_ma_self;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
DO $$
BEGIN
  INSERT INTO public.mandate_audit (actor_id, client_id, action)
  VALUES ('11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111','view');
  RAISE NOTICE 'PASS: mandate_audit self-audit insert allowed';
END $$;
RESET ROLE;
RESET request.jwt.claims;

SAVEPOINT case_ma_forge;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.mandate_audit (actor_id, client_id, action)
    VALUES ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','view');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'FAIL: mandate_audit — forged insert against user B was NOT blocked';
  END IF;
  RAISE NOTICE 'PASS: mandate_audit forged insert blocked';
END $$;
RESET ROLE;
RESET request.jwt.claims;

-- Grant consent from B → A, then repeat the same insert; must now succeed.
INSERT INTO public.advisory_consents (user_id, granted_to, scope, granted_at)
VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','full', now());

SAVEPOINT case_ma_with_consent;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
DO $$
BEGIN
  INSERT INTO public.mandate_audit (actor_id, client_id, action)
  VALUES ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','view');
  RAISE NOTICE 'PASS: mandate_audit insert allowed once consent exists';
END $$;
RESET ROLE;
RESET request.jwt.claims;

-- ===========================================================================
-- 3. referral_codes
--    - anonymous role: no SELECT at all
--    - authenticated non-admin: no SELECT (broad policy was removed)
--    - admin: full SELECT
--    - non-admin can still resolve a code through lookup_referral_code RPC
-- ===========================================================================
SAVEPOINT case_rc_anon;
SET LOCAL ROLE anon;
DO $$
DECLARE anon_visible int;
BEGIN
  SELECT count(*) INTO anon_visible FROM public.referral_codes WHERE code = 'RLSTEST-EXPOSE';
  IF anon_visible <> 0 THEN
    RAISE EXCEPTION 'FAIL: referral_codes — anon should not see any rows (got %)', anon_visible;
  END IF;
  RAISE NOTICE 'PASS: referral_codes hidden from anon';
END $$;
RESET ROLE;

SAVEPOINT case_rc_user;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
DO $$
DECLARE user_visible int;
BEGIN
  SELECT count(*) INTO user_visible FROM public.referral_codes WHERE code = 'RLSTEST-EXPOSE';
  IF user_visible <> 0 THEN
    RAISE EXCEPTION 'FAIL: referral_codes — regular user leaked % row(s) (stripe_coupon_id exposure)', user_visible;
  END IF;
  RAISE NOTICE 'PASS: referral_codes hidden from authenticated non-admin';
END $$;

-- Non-admin should still be able to resolve a code through the security-definer RPC.
DO $$
DECLARE v jsonb;
BEGIN
  v := public.lookup_referral_code('RLSTEST-EXPOSE');
  IF (v->>'found')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL: lookup_referral_code should still resolve the code for regular users (got %)', v;
  END IF;
  RAISE NOTICE 'PASS: lookup_referral_code still works for regular users';
END $$;
RESET ROLE;
RESET request.jwt.claims;

SAVEPOINT case_rc_admin;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
DO $$
DECLARE admin_visible int;
BEGIN
  SELECT count(*) INTO admin_visible FROM public.referral_codes WHERE code = 'RLSTEST-EXPOSE';
  IF admin_visible <> 1 THEN
    RAISE EXCEPTION 'FAIL: referral_codes — admin should see the row (got %)', admin_visible;
  END IF;
  RAISE NOTICE 'PASS: referral_codes visible to admin';
END $$;
RESET ROLE;
RESET request.jwt.claims;

-- Never commit — this is a pure regression check.
ROLLBACK;
\echo 'All RLS regression checks passed.'