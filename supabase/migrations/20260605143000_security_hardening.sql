-- 1) Stop broadcasting sensitive admin tables via Realtime
ALTER PUBLICATION supabase_realtime DROP TABLE public.audit_log;
ALTER PUBLICATION supabase_realtime DROP TABLE public.incident_log;

-- 2) Constrain advisory_consents.scope to known values (no silent 'full' escalation from client)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'advisory_consents_scope_check'
  ) THEN
    ALTER TABLE public.advisory_consents
      ADD CONSTRAINT advisory_consents_scope_check
      CHECK (scope IN ('portfolio_read','net_worth_read','orders_read','suitability_read','full'));
  END IF;
END $$;

-- 3) Defense-in-depth: restrictive policy so only admins can ever write user_roles,
--    even if a permissive policy is misconfigured later.
DROP POLICY IF EXISTS "Only admins can write user_roles (restrictive)" ON public.user_roles;
CREATE POLICY "Only admins can write user_roles (restrictive)"
ON public.user_roles
AS RESTRICTIVE
FOR ALL
TO authenticated, anon
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) Lock down SECURITY DEFINER functions: revoke broad EXECUTE.
--    Trigger functions never need direct EXECUTE from API roles.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

--    Helpers used inside RLS policies / RPCs: keep EXECUTE only for the roles
--    that actually need it; revoke from PUBLIC and anon.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_advisory_consent(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ai_usage_this_month(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_advisory_consent(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_this_month(uuid) TO authenticated;
