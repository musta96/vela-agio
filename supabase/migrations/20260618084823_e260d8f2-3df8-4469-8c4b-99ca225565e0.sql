
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS has_gated boolean
  GENERATED ALWAYS AS (gated_html IS NOT NULL AND length(gated_html) > 0) STORED;

GRANT SELECT (has_gated) ON public.blog_posts TO anon, authenticated;
