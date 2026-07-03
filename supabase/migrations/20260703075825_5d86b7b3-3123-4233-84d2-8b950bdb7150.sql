CREATE OR REPLACE VIEW public.blog_posts_public
WITH (security_invoker = true) AS
SELECT id, slug, title, excerpt, cover_image_url, content_html, category, tags,
       author_name, reading_minutes, seo_title, seo_description, published,
       published_at, created_at, updated_at, lead_magnet_enabled,
       lead_magnet_layout, lead_magnet_cta, lead_magnet_fields,
       lead_magnet_file_name, COALESCE(has_gated, false) AS has_gated
FROM public.blog_posts
WHERE published = true;

GRANT SELECT ON public.blog_posts_public TO anon, authenticated;