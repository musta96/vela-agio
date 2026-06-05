-- 1) Stop broadcasting sensitive admin tables via Realtime
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='audit_log') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.audit_log';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='incident_log') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.incident_log';
  END IF;
END $$;

-- 2) Whitelist advisory_consents.scope
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advisory_consents_scope_check') THEN
    ALTER TABLE public.advisory_consents
      ADD CONSTRAINT advisory_consents_scope_check
      CHECK (scope IN ('portfolio_read','net_worth_read','orders_read','suitability_read','full'));
  END IF;
END $$;

-- 3) Defense-in-depth: restrictive admin-only policy on user_roles writes
DROP POLICY IF EXISTS "Only admins can write user_roles (restrictive)" ON public.user_roles;
CREATE POLICY "Only admins can write user_roles (restrictive)"
ON public.user_roles
AS RESTRICTIVE
FOR ALL
TO authenticated, anon
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) Lock SECURITY DEFINER function EXECUTE
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_advisory_consent(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ai_usage_this_month(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_advisory_consent(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_this_month(uuid) TO authenticated;

-- 5) Restrict platform_controls read to admins only
DROP POLICY IF EXISTS "Authenticated read controls" ON public.platform_controls;
DROP POLICY IF EXISTS "Admins read platform controls" ON public.platform_controls;
CREATE POLICY "Admins read platform controls"
ON public.platform_controls
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));