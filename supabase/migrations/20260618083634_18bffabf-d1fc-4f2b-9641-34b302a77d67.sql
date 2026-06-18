
DROP POLICY IF EXISTS "Admins upload blog assets" ON storage.objects;
CREATE POLICY "Admins upload blog assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'blog-assets' AND public.has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "Admins read blog assets" ON storage.objects;
CREATE POLICY "Admins read blog assets"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'blog-assets' AND public.has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "Admins update blog assets" ON storage.objects;
CREATE POLICY "Admins update blog assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'blog-assets' AND public.has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "Admins delete blog assets" ON storage.objects;
CREATE POLICY "Admins delete blog assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'blog-assets' AND public.has_role(auth.uid(),'admin'::app_role));
