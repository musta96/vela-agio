
-- Column-level grants: everything except gated_html
GRANT SELECT (
  id, slug, title, excerpt, cover_image_url, content_html, category, tags,
  author_name, reading_minutes, seo_title, seo_description, published, published_at,
  created_at, updated_at, lead_magnet_enabled, lead_magnet_layout, lead_magnet_cta,
  lead_magnet_fields, lead_magnet_file_name, has_gated
) ON public.blog_posts TO anon, authenticated;

-- RLS policy: anyone can read published rows
DROP POLICY IF EXISTS "Public can read published posts" ON public.blog_posts;
CREATE POLICY "Public can read published posts"
ON public.blog_posts FOR SELECT
TO anon, authenticated
USING (published = true);

-- Grant on the view itself
GRANT SELECT ON public.blog_posts_public TO anon, authenticated;
