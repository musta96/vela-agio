
-- 1) blog_assets: public SELECT for non-sensitive paths (cover/, public/)
CREATE POLICY "Public read of public blog-assets paths"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'blog-assets'
  AND (
    (storage.foldername(name))[1] IN ('public','cover','covers')
  )
);

-- 2) blog_leads: explicit anon + authenticated INSERT policy
--    The unlock_blog_post() SECURITY DEFINER fn handles validation; also allow direct anon inserts for public lead forms
CREATE POLICY "Anyone can submit blog leads"
ON public.blog_leads
FOR INSERT
TO anon, authenticated
WITH CHECK (
  email IS NOT NULL
  AND char_length(email) <= 320
  AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
);

GRANT INSERT ON public.blog_leads TO anon, authenticated;

-- 3) health_checks: block all writes from anon/authenticated via restrictive policies
CREATE POLICY "Block health_checks inserts from non-service"
ON public.health_checks
AS RESTRICTIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY "Block health_checks updates from non-service"
ON public.health_checks
AS RESTRICTIVE
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Block health_checks deletes from non-service"
ON public.health_checks
AS RESTRICTIVE
FOR DELETE
TO anon, authenticated
USING (false);
