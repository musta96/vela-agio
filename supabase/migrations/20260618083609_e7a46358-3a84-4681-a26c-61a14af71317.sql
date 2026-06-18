
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS lead_magnet_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lead_magnet_layout text NOT NULL DEFAULT 'with_article',
  ADD COLUMN IF NOT EXISTS lead_magnet_file_path text,
  ADD COLUMN IF NOT EXISTS lead_magnet_file_name text,
  ADD COLUMN IF NOT EXISTS lead_magnet_cta text,
  ADD COLUMN IF NOT EXISTS lead_magnet_fields jsonb NOT NULL DEFAULT '{"first_name":true,"last_name":true,"company":false,"role":false,"country":false,"consent":true}'::jsonb;

ALTER TABLE public.blog_posts DROP CONSTRAINT IF EXISTS blog_posts_lead_magnet_layout_check;
ALTER TABLE public.blog_posts ADD CONSTRAINT blog_posts_lead_magnet_layout_check
  CHECK (lead_magnet_layout IN ('with_article','form_only'));

ALTER TABLE public.blog_leads
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'gate';

ALTER TABLE public.blog_leads DROP CONSTRAINT IF EXISTS blog_leads_kind_check;
ALTER TABLE public.blog_leads ADD CONSTRAINT blog_leads_kind_check
  CHECK (kind IN ('gate','lead_magnet'));

GRANT SELECT (lead_magnet_enabled, lead_magnet_layout, lead_magnet_cta, lead_magnet_fields, lead_magnet_file_name)
  ON public.blog_posts TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_blog_leads()
RETURNS TABLE (
  id uuid,
  post_id uuid,
  post_title text,
  post_slug text,
  email text,
  first_name text,
  last_name text,
  company text,
  role text,
  country text,
  consent boolean,
  kind text,
  source text,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT l.id, l.post_id, p.title, p.slug,
           l.email, l.first_name, l.last_name, l.company, l.role, l.country,
           l.consent, l.kind, l.source, l.created_at
    FROM public.blog_leads l
    LEFT JOIN public.blog_posts p ON p.id = l.post_id
    ORDER BY l.created_at DESC
    LIMIT 5000;
END $$;
