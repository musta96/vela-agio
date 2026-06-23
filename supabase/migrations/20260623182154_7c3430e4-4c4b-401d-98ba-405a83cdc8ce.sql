
CREATE TABLE public.feature_gate_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  current_tier text,
  current_plan_slug text,
  page_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.feature_gate_blocks TO authenticated;
GRANT SELECT ON public.feature_gate_blocks TO authenticated;
GRANT ALL ON public.feature_gate_blocks TO service_role;

ALTER TABLE public.feature_gate_blocks ENABLE ROW LEVEL SECURITY;

-- A user may insert their own block events.
CREATE POLICY "fgb_user_insert"
  ON public.feature_gate_blocks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Admins only can read.
CREATE POLICY "fgb_admin_read"
  ON public.feature_gate_blocks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX feature_gate_blocks_key_time_idx
  ON public.feature_gate_blocks (feature_key, created_at DESC);
CREATE INDEX feature_gate_blocks_user_time_idx
  ON public.feature_gate_blocks (user_id, created_at DESC);

-- Aggregate view for the owner console (admins only).
CREATE OR REPLACE FUNCTION public.admin_feature_block_summary(_since timestamptz DEFAULT now() - interval '30 days')
RETURNS TABLE(feature_key text, blocks bigint, unique_users bigint, last_block timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    feature_key,
    COUNT(*)::bigint AS blocks,
    COUNT(DISTINCT user_id)::bigint AS unique_users,
    MAX(created_at) AS last_block
  FROM public.feature_gate_blocks
  WHERE created_at >= _since
    AND public.has_role(auth.uid(), 'admin'::app_role)
  GROUP BY feature_key
  ORDER BY blocks DESC;
$$;

GRANT EXECUTE ON FUNCTION public.admin_feature_block_summary(timestamptz) TO authenticated, service_role;
