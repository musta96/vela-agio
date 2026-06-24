
-- Defense-in-depth: deny non-admin SELECT on blog_leads
CREATE POLICY "blog_leads_deny_non_admin_select"
ON public.blog_leads
AS RESTRICTIVE
FOR SELECT
TO anon, authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Allow authenticated users to read non-sensitive fields of active referral codes
CREATE POLICY "referral_codes_authenticated_can_read_active"
ON public.referral_codes
FOR SELECT
TO authenticated
USING (active = true AND (expires_at IS NULL OR expires_at > now()));

-- Authenticated users may read their own avatar object; public bucket access is removed
CREATE POLICY "avatars_authenticated_read_own"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
