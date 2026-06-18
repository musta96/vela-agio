
-- 1. Remove public/anonymous SELECT on the blog_posts table (gated_html was leaking)
DROP POLICY IF EXISTS "Public can read published posts" ON public.blog_posts;
REVOKE SELECT ON public.blog_posts FROM anon;

-- Keep authenticated SELECT (RLS still restricts to admins via existing policy)

-- 2. Safe public view exposing everything EXCEPT gated_html
CREATE OR REPLACE VIEW public.blog_posts_public
WITH (security_invoker = false) AS
SELECT
  id, slug, title, excerpt, cover_image_url, content_html,
  category, tags, author_name, reading_minutes,
  seo_title, seo_description, published, published_at,
  created_at, updated_at,
  (gated_html IS NOT NULL AND length(btrim(gated_html)) > 0) AS has_gated
FROM public.blog_posts
WHERE published = true;

GRANT SELECT ON public.blog_posts_public TO anon, authenticated;

-- 3. RPC that records the lead and returns gated_html only after a valid email
CREATE OR REPLACE FUNCTION public.unlock_blog_post(p_slug text, p_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id uuid;
  v_gated text;
BEGIN
  IF p_email IS NULL OR p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(p_email) > 320 THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  SELECT id, gated_html INTO v_post_id, v_gated
  FROM public.blog_posts
  WHERE slug = p_slug AND published = true;

  IF v_post_id IS NULL THEN
    RAISE EXCEPTION 'post_not_found';
  END IF;

  INSERT INTO public.blog_leads (post_id, email, source)
  VALUES (v_post_id, lower(btrim(p_email)), 'blog-gate');

  RETURN COALESCE(v_gated, '');
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_blog_post(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.unlock_blog_post(text, text) TO anon, authenticated;
