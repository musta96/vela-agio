
-- 1) Restrict direct table reads on blog_posts to admins only
DROP POLICY IF EXISTS "Public can read published posts" ON public.blog_posts;

-- 2) Safe public view: excludes gated_html and lead_magnet_file_path, exposes a boolean has_gated flag
DROP VIEW IF EXISTS public.blog_posts_public;
CREATE VIEW public.blog_posts_public
WITH (security_invoker = off) AS
SELECT
  id, slug, title, excerpt, cover_image_url, content_html, category, tags,
  author_name, reading_minutes, seo_title, seo_description,
  published, published_at, created_at, updated_at,
  lead_magnet_enabled, lead_magnet_layout, lead_magnet_cta, lead_magnet_fields,
  lead_magnet_file_name,
  (gated_html IS NOT NULL AND length(gated_html) > 0) AS has_gated
FROM public.blog_posts
WHERE published = true;

REVOKE ALL ON public.blog_posts_public FROM PUBLIC;
GRANT SELECT ON public.blog_posts_public TO anon, authenticated;

-- 3) Remove direct anon INSERT into blog_leads; writes must go through edge function / SECURITY DEFINER RPC
DROP POLICY IF EXISTS "Anyone can submit a lead" ON public.blog_leads;
REVOKE INSERT ON public.blog_leads FROM anon, authenticated;
