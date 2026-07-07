-- Drop the row-level policy that exposed the full blog_posts row (including gated_html)
-- to any anon/authenticated client hitting the base table via PostgREST.
DROP POLICY IF EXISTS "Public can read published posts" ON public.blog_posts;

-- Switch the public-facing view to SECURITY DEFINER so anon can still read the safe
-- column subset without needing a row-level SELECT policy on the base table.
-- The view definition already excludes gated_html and filters to published = true.
ALTER VIEW public.blog_posts_public SET (security_invoker = false);

-- Ensure the roles that read the view keep access.
GRANT SELECT ON public.blog_posts_public TO anon, authenticated;
