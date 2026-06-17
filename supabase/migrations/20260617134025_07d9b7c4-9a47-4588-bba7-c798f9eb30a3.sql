
-- 1) ai_signal_log: document intent — writes are service-role only
DROP POLICY IF EXISTS "Deny client inserts on ai_signal_log" ON public.ai_signal_log;
DROP POLICY IF EXISTS "Deny client updates on ai_signal_log" ON public.ai_signal_log;
DROP POLICY IF EXISTS "Deny client deletes on ai_signal_log" ON public.ai_signal_log;

CREATE POLICY "Deny client inserts on ai_signal_log"
ON public.ai_signal_log
AS RESTRICTIVE
FOR INSERT
TO authenticated, anon
WITH CHECK (false);

CREATE POLICY "Deny client updates on ai_signal_log"
ON public.ai_signal_log
AS RESTRICTIVE
FOR UPDATE
TO authenticated, anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny client deletes on ai_signal_log"
ON public.ai_signal_log
AS RESTRICTIVE
FOR DELETE
TO authenticated, anon
USING (false);

-- 2) gdpr_erasure_requests: allow users to submit their own requests
DROP POLICY IF EXISTS "Users can submit their own erasure requests" ON public.gdpr_erasure_requests;

CREATE POLICY "Users can submit their own erasure requests"
ON public.gdpr_erasure_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 3) landing_versions: explicit restrictive deny for non-admins to document intent
DROP POLICY IF EXISTS "Deny non-admin reads on landing_versions" ON public.landing_versions;

CREATE POLICY "Deny non-admin reads on landing_versions"
ON public.landing_versions
AS RESTRICTIVE
FOR SELECT
TO authenticated, anon
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4) Avatars bucket: keep files reachable via public URL but block bucket listing
DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Avatar public read" ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view avatars" ON storage.objects;

-- Authenticated users can list/read avatars metadata via the storage API
CREATE POLICY "Authenticated users can view avatar metadata"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

-- Owners can manage only their own avatar files (folder = their user id)
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

CREATE POLICY "Users can upload their own avatar"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own avatar"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
