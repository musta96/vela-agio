
-- 1) feature_gate_blocks: allow users to read their own gate-block history
DROP POLICY IF EXISTS "fgb_user_read_own" ON public.feature_gate_blocks;
CREATE POLICY "fgb_user_read_own"
ON public.feature_gate_blocks
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 2) mandate_audit: prevent forged audit entries by requiring a real relationship
--    (self-audit, or an active advisory consent between actor and client).
DROP POLICY IF EXISTS "Actors insert their own audit rows" ON public.mandate_audit;
CREATE POLICY "Actors insert audit rows for real relationships"
ON public.mandate_audit
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = actor_id
  AND (
    actor_id = client_id
    OR EXISTS (
      SELECT 1 FROM public.advisory_consents c
      WHERE c.user_id = mandate_audit.client_id
        AND c.granted_to = mandate_audit.actor_id
        AND c.revoked_at IS NULL
        AND (c.expires_at IS NULL OR c.expires_at > now())
    )
  )
);

-- 3) referral_codes: stop exposing stripe_coupon_id (and other sensitive
--    columns) to all authenticated users. The app uses the SECURITY DEFINER
--    lookup_referral_code / redeem_referral_code RPCs for redemption, and
--    admins retain full access via the "admins manage referral_codes" policy,
--    so the broad SELECT policy is not needed.
DROP POLICY IF EXISTS "referral_codes_authenticated_can_read_active" ON public.referral_codes;
