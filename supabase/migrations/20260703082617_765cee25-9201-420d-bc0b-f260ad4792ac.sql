-- Prevent direct SELECT of gated_html on blog_posts by anon/authenticated.
-- The row-level policy stays so the security-invoker view public.blog_posts_public
-- keeps returning published rows, but explicit column grants exclude gated_html.
REVOKE ALL ON TABLE public.blog_posts FROM anon, authenticated;

GRANT SELECT (
  id, slug, title, excerpt, cover_image_url, content_html,
  category, tags, author_name, reading_minutes,
  seo_title, seo_description, published, published_at,
  created_at, updated_at, has_gated,
  lead_magnet_enabled, lead_magnet_layout, lead_magnet_cta,
  lead_magnet_fields, lead_magnet_file_name
) ON public.blog_posts TO anon, authenticated;

-- Admin writes still work via existing authenticated-role RLS policies and
-- table-level privileges granted to authenticated at insert/update/delete time.
GRANT INSERT, UPDATE, DELETE ON public.blog_posts TO authenticated;
GRANT ALL ON public.blog_posts TO service_role;