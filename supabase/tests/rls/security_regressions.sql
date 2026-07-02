-- RLS regression tests for the security findings fixed on 2026-07-02:
--   * feature_gate_blocks_missing_select_for_users
--   * mandate_audit_client_insert_spoofing
--   * referral_codes_stripe_coupon_exposure
--
-- Runs inside a single transaction and ROLLBACKs at the end so it leaves no
-- state behind. Must be executed by a role with schema-owner privileges
-- (typically `postgres`, via `SUPABASE_DB_URL`) — the tests themselves flip
-- into the `authenticated` role with faked JWT claims to exercise the RLS
-- policies.
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls/security_regressions.sql

\set ON_ERROR_STOP on
BEGIN;
SET LOCAL client_min_messages = warning;

-- Drop the auth.users FKs for the duration of this transaction so we can
-- seed synthetic users without touching the auth schema. ROLLBACK below
-- restores the original constraints.
ALTER TABLE public.feature_gate_blocks DROP CONSTRAINT IF EXISTS feature_gate_blocks_user_id_fkey;
ALTER TABLE public.user_roles          DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------
INSERT INTO public.user_roles (user_id, role)
VALUES ('33333333-3333-3333-3333-333333333333', 'admin'::app_role)
ON CONFLICT DO NOTHING;

INSERT INTO public.feature_gate_blocks (user_id, feature_key) VALUES
  ('11111111-1111-1111-1111-111111111111', 'test.rls.a'),
  ('22222222-2222-2222-2222-222222222222', 'test.rls.b');

INSERT INTO public.referral_codes (code, kind, stripe_coupon_id, active)
VALUES ('RLSTEST-EXPOSE', 'discount', 'coupon_secret_do_not_leak', true);

-- ===========================================================================
-- 1. feature_gate_blocks — users see only own rows; admin sees all.
-- ===========================================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
DO $$
DECLARE own_count int; other_count int;
BEGIN
  SELECT count(*) INTO own_count   FROM public.feature_gate_blocks WHERE feature_key = 'test.rls.a';
  SELECT count(*) INTO other_count FROM public.feature_gate_blocks WHERE feature_key = 'test.rls.b';
  IF own_count <> 1  THEN RAISE EXCEPTION 'FAIL feature_gate_blocks: user A should see own row (got %)', own_count; END IF;
  IF other_count <> 0 THEN RAISE EXCEPTION 'FAIL feature_gate_blocks: user A leaked user B rows (got %)', other_count; END IF;
  RAISE NOTICE 'PASS feature_gate_blocks: owner-only SELECT';
END $$;
RESET ROLE; RESET request.jwt.claims;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
DO $$
DECLARE all_count int;
BEGIN
  SELECT count(*) INTO all_count FROM public.feature_gate_blocks WHERE feature_key LIKE 'test.rls.%';
  IF all_count <> 2 THEN RAISE EXCEPTION 'FAIL feature_gate_blocks: admin should see both rows (got %)', all_count; END IF;
  RAISE NOTICE 'PASS feature_gate_blocks: admin SELECT';
END $$;
RESET ROLE; RESET request.jwt.claims;

-- ===========================================================================
-- 2. mandate_audit — self-audit OK; forge blocked; forge with consent OK.
-- ===========================================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
DO $$
BEGIN
  INSERT INTO public.mandate_audit (actor_id, client_id, action)
  VALUES ('11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111','view');
  RAISE NOTICE 'PASS mandate_audit: self-audit allowed';
END $$;

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
    RAISE EXCEPTION 'FAIL mandate_audit: forged insert against user B was NOT blocked';
  END IF;
  RAISE NOTICE 'PASS mandate_audit: forged insert blocked';
END $$;
RESET ROLE; RESET request.jwt.claims;

-- Grant consent B -> A (bypass RLS on advisory_consents by running as postgres role),
-- then repeat the previously-blocked insert as A.
INSERT INTO public.advisory_consents (user_id, granted_to, scope, granted_at)
VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','full', now());

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
DO $$
BEGIN
  INSERT INTO public.mandate_audit (actor_id, client_id, action)
  VALUES ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','view');
  RAISE NOTICE 'PASS mandate_audit: insert allowed once consent exists';
END $$;
RESET ROLE; RESET request.jwt.claims;

-- ===========================================================================
-- 3. referral_codes — anon and non-admin SELECT is empty; admin sees all;
--    the security-definer RPC still resolves codes for regular users.
-- ===========================================================================
SET LOCAL ROLE anon;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.referral_codes WHERE code = 'RLSTEST-EXPOSE';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL referral_codes: anon should not see any rows (got %)', n; END IF;
  RAISE NOTICE 'PASS referral_codes: hidden from anon';
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
DO $$
DECLARE n int; v jsonb;
BEGIN
  SELECT count(*) INTO n FROM public.referral_codes WHERE code = 'RLSTEST-EXPOSE';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL referral_codes: regular user leaked % row(s) (stripe_coupon_id exposure)', n; END IF;
  RAISE NOTICE 'PASS referral_codes: hidden from authenticated non-admin';

  v := public.lookup_referral_code('RLSTEST-EXPOSE');
  IF (v->>'found')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL lookup_referral_code: RPC should still resolve for regular users (got %)', v;
  END IF;
  RAISE NOTICE 'PASS lookup_referral_code: still resolves for regular users';
END $$;
RESET ROLE; RESET request.jwt.claims;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.referral_codes WHERE code = 'RLSTEST-EXPOSE';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL referral_codes: admin should see the row (got %)', n; END IF;
  RAISE NOTICE 'PASS referral_codes: visible to admin';
END $$;
RESET ROLE; RESET request.jwt.claims;

-- Never commit — pure regression check.
ROLLBACK;
\echo 'All RLS regression checks passed.'