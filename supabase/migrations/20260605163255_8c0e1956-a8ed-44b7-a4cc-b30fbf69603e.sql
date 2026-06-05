-- Harden advisory_consents INSERT policy:
-- prevent a client from granting consent to themselves (self-grant bypass)
-- and require the grantee to actually hold an advisor-like privileged role.

DROP POLICY IF EXISTS "Clients grant own consent" ON public.advisory_consents;

CREATE POLICY "Clients grant own consent"
  ON public.advisory_consents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND granted_to <> user_id
    AND (
      public.has_role(granted_to, 'admin'::public.app_role)
      OR public.has_role(granted_to, 'compliance'::public.app_role)
      OR public.has_role(granted_to, 'support'::public.app_role)
    )
  );