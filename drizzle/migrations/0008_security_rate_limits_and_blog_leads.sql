-- 1) blog_leads: remove the policy that lists the `anon` role for SELECT.
-- It could never return rows (has_role(NULL,'admin') is false), but it makes
-- admin_rls_audit report allows_anon_select = true and leaves the intent unclear.
-- Lead reads happen exclusively through admin_list_blog_leads().
DROP POLICY IF EXISTS "blog_leads_deny_non_admin_select" ON public.blog_leads;
REVOKE SELECT, UPDATE, DELETE ON public.blog_leads FROM anon;
GRANT INSERT ON public.blog_leads TO anon;          -- public form still works
GRANT SELECT, INSERT ON public.blog_leads TO authenticated;
GRANT ALL ON public.blog_leads TO service_role;

-- 2) Shared rate-limit store for public edge functions.
CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
  bucket text PRIMARY KEY,
  hits integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.edge_rate_limits TO service_role;
ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (edge functions) may touch this table.

-- Atomic consume: returns true when the call is allowed, false when the caller
-- has exhausted `_limit` hits inside the rolling `_window_seconds` window.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  _key text,
  _limit integer,
  _window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hits integer;
BEGIN
  INSERT INTO public.edge_rate_limits AS r (bucket, hits, window_start)
  VALUES (_key, 1, now())
  ON CONFLICT (bucket) DO UPDATE
    SET hits = CASE
                 WHEN r.window_start < now() - make_interval(secs => _window_seconds) THEN 1
                 ELSE r.hits + 1
               END,
        window_start = CASE
                 WHEN r.window_start < now() - make_interval(secs => _window_seconds) THEN now()
                 ELSE r.window_start
               END
  RETURNING hits INTO v_hits;

  RETURN v_hits <= GREATEST(1, _limit);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;