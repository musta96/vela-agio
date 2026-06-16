
-- 1. Fix advisory consent expiry enforcement
CREATE OR REPLACE FUNCTION public.has_advisory_consent(_client uuid, _admin uuid, _scope text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.advisory_consents
    WHERE user_id = _client
      AND granted_to = _admin
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
      AND (scope = _scope OR scope = 'full')
  );
$$;

-- 2. Avatars bucket: add explicit SELECT policy (public bucket, but make policy explicit)
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
CREATE POLICY "Public read avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- 3. Platform banners: restrict authenticated reads to active, non-expired entries
DROP POLICY IF EXISTS "Authenticated read banners" ON public.platform_banners;
CREATE POLICY "Authenticated read active banners"
ON public.platform_banners FOR SELECT
TO authenticated
USING (
  active = true
  AND (expires_at IS NULL OR expires_at > now())
);

-- 4. Lock down SECURITY DEFINER helpers that don't need client access
REVOKE EXECUTE ON FUNCTION public.ai_usage_this_month(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_credits_this_month(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_margin_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_this_month(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_credits_this_month(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_margin_summary() TO service_role;
