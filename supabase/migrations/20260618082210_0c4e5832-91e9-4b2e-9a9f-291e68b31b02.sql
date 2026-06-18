
DROP VIEW IF EXISTS public.blog_posts_public;

-- Re-create row-level read policy for anonymous + authenticated on published posts
CREATE POLICY "Public can read published posts"
ON public.blog_posts
FOR SELECT
USING (published = true);

-- Column-level: anon can only read non-gated columns
GRANT SELECT
  (id, slug, title, excerpt, cover_image_url, content_html,
   category, tags, author_name, reading_minutes,
   seo_title, seo_description, published, published_at,
   created_at, updated_at)
ON public.blog_posts TO anon;

-- Authenticated: same restriction for normal users; admins use RPC for the gated body
REVOKE SELECT ON public.blog_posts FROM authenticated;
GRANT SELECT
  (id, slug, title, excerpt, cover_image_url, content_html,
   category, tags, author_name, reading_minutes,
   seo_title, seo_description, published, published_at,
   created_at, updated_at)
ON public.blog_posts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.blog_posts TO authenticated;

-- Admin RPC to fetch full posts including gated_html for the editor
CREATE OR REPLACE FUNCTION public.admin_list_blog_posts()
RETURNS SETOF public.blog_posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT * FROM public.blog_posts ORDER BY updated_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_blog_posts() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_blog_posts() TO authenticated;
