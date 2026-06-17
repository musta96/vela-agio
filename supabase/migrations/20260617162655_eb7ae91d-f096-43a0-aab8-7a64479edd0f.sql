
-- 1) feature_flags: restrict table SELECT to admins; expose a minimal RPC for app users
DROP POLICY IF EXISTS "Authenticated users can read feature flags" ON public.feature_flags;

CREATE POLICY "Admins read feature flags"
  ON public.feature_flags FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.get_enabled_feature_flags()
RETURNS TABLE(key text, enabled boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT key, enabled FROM public.feature_flags;
$$;

REVOKE ALL ON FUNCTION public.get_enabled_feature_flags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_enabled_feature_flags() TO anon, authenticated, service_role;

-- 2) advisory_consents: add a restrictive INSERT policy that blocks ALL client-side inserts.
--    Only service_role (used by the grant-advisory-consent edge function) can insert,
--    because service_role bypasses RLS entirely.
CREATE POLICY "Block direct client inserts on advisory_consents"
  ON public.advisory_consents AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

-- 3) platform_banners: allow anonymous read of active, non-expired banners
CREATE POLICY "Anyone can read active banners"
  ON public.platform_banners FOR SELECT
  TO anon
  USING (active = true AND (expires_at IS NULL OR expires_at > now()));
