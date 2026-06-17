
-- 1) feature_flags: restrict read to authenticated users (was public)
DROP POLICY IF EXISTS "feature_flags public read" ON public.feature_flags;
CREATE POLICY "Authenticated users can read feature flags"
  ON public.feature_flags FOR SELECT
  TO authenticated
  USING (true);

-- 2) advisory_consents: remove direct client INSERT; grants must go through edge function
DROP POLICY IF EXISTS "Clients grant own consent" ON public.advisory_consents;
-- (no replacement INSERT policy for end-users; service_role bypasses RLS and is used by the
--  grant-advisory-consent edge function, which validates that granted_to is a real staff member.)

-- 3) storage.objects: drop broad public SELECT policies on the avatars bucket so anonymous
--    clients cannot list bucket contents via the storage API. Direct public URLs still work
--    because the avatars bucket itself is public.
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view avatar metadata" ON storage.objects;

CREATE POLICY "Authenticated users read own avatar metadata"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );
