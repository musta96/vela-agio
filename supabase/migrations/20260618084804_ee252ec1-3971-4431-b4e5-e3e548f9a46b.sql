
-- Drop the definer view (linter flagged) and use column-level grants instead
DROP VIEW IF EXISTS public.blog_posts_public;

-- Restore the public RLS policy for row-level access to published posts
CREATE POLICY "Public can read published posts"
  ON public.blog_posts
  FOR SELECT
  TO anon, authenticated
  USING (published = true);

-- Revoke broad SELECT for non-admin roles, then grant only safe columns
REVOKE SELECT ON public.blog_posts FROM anon, authenticated;

GRANT SELECT (
  id, slug, title, excerpt, cover_image_url, content_html, category, tags,
  author_name, reading_minutes, seo_title, seo_description,
  published, published_at, created_at, updated_at,
  lead_magnet_enabled, lead_magnet_layout, lead_magnet_cta, lead_magnet_fields,
  lead_magnet_file_name
) ON public.blog_posts TO anon, authenticated;

-- Admin policy already grants admin role full access via authenticated;
-- ensure admin queries still have full column read by granting on all columns to service_role
GRANT SELECT ON public.blog_posts TO service_role;
