-- Restore anon (and authenticated) read access to published blog posts.
-- Root cause: blog_posts_public had no GRANTs, and blog_posts had no anon-readable
-- policy, so /blog was empty for logged-out visitors.

-- 1) Make the public view a security-invoker view so RLS on the base table applies.
ALTER VIEW public.blog_posts_public SET (security_invoker = on);

-- 2) Allow anon + authenticated to SELECT published rows on the base table.
--    (Existing admin policies remain untouched.)
DROP POLICY IF EXISTS "Anyone can read published posts" ON public.blog_posts;
CREATE POLICY "Anyone can read published posts"
  ON public.blog_posts
  FOR SELECT
  TO anon, authenticated
  USING (published = true);

-- 3) Data-API GRANTs. The view + base table currently have no grants at all,
--    which is why PostgREST returned zero rows to anon.
GRANT SELECT ON public.blog_posts_public TO anon, authenticated;
GRANT SELECT ON public.blog_posts        TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_posts TO authenticated;
GRANT ALL ON public.blog_posts_public TO service_role;
GRANT ALL ON public.blog_posts        TO service_role;
