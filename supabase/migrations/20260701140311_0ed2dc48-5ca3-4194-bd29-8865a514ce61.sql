
-- 1) Fully lock blog_posts table from anon/authenticated SELECT; public reads must use the safe view.
DROP POLICY IF EXISTS "Public can read published posts" ON public.blog_posts;

-- 2) Recreate the safe public view (excludes gated_html and lead_magnet_file_path)
DROP VIEW IF EXISTS public.blog_posts_public;
CREATE VIEW public.blog_posts_public
WITH (security_invoker = off, security_barrier = true) AS
SELECT
  id, slug, title, excerpt, cover_image_url, content_html,
  category, tags, author_name, reading_minutes,
  seo_title, seo_description, published, published_at,
  created_at, updated_at,
  lead_magnet_enabled, lead_magnet_layout, lead_magnet_cta,
  lead_magnet_fields, lead_magnet_file_name,
  COALESCE(has_gated, (gated_html IS NOT NULL AND length(gated_html) > 0)) AS has_gated
FROM public.blog_posts
WHERE published = true;

REVOKE ALL ON public.blog_posts_public FROM PUBLIC;
GRANT SELECT ON public.blog_posts_public TO anon, authenticated;

-- 3) Backfill profiles.avatar_url from legacy public URL to storage path
UPDATE public.profiles
SET avatar_url = regexp_replace(avatar_url, '^.*/object/(?:public|sign)/avatars/', '')
WHERE avatar_url IS NOT NULL AND avatar_url LIKE '%/avatars/%';

-- 4) Admin diagnostics: subscriptions missing a plan mapping (unknown price_id)
CREATE OR REPLACE FUNCTION public.admin_subscriptions_missing_plan(_env text DEFAULT 'live')
RETURNS TABLE(subscription_id uuid, user_id uuid, status text, price_id text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT s.id, s.user_id, s.status, s.price_id, s.created_at
  FROM public.subscriptions s
  LEFT JOIN public.subscription_plans p
    ON p.stripe_monthly_price_id = s.price_id OR p.stripe_yearly_price_id = s.price_id
  WHERE s.environment = _env
    AND public.has_role(auth.uid(), 'admin'::app_role)
    AND (s.price_id IS NULL OR p.id IS NULL)
  ORDER BY s.created_at DESC
  LIMIT 500;
$$;
GRANT EXECUTE ON FUNCTION public.admin_subscriptions_missing_plan(text) TO authenticated;

-- 5) Admin diagnostics: RLS coverage summary for key public tables
CREATE OR REPLACE FUNCTION public.admin_rls_audit()
RETURNS TABLE(table_name text, rls_enabled boolean, policy_count integer, allows_anon_select boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT c.relname::text,
           c.relrowsecurity,
           COALESCE((SELECT COUNT(*)::int FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname), 0),
           EXISTS (
             SELECT 1 FROM pg_policies p
             WHERE p.schemaname='public' AND p.tablename=c.relname
               AND p.cmd='SELECT' AND 'anon' = ANY(p.roles)
           )
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
    ORDER BY c.relname;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_rls_audit() TO authenticated;
