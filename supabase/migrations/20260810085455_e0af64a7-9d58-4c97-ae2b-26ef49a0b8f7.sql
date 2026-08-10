CREATE OR REPLACE FUNCTION public.admin_gating_funnel(_days integer DEFAULT 30)
RETURNS TABLE(
  feature text,
  required_plan text,
  views bigint,
  unique_viewers bigint,
  cta_clicks bigint,
  unique_clickers bigint,
  ctr numeric,
  avg_dwell_ms numeric,
  median_dwell_ms numeric,
  upgrades bigint,
  conversion_rate numeric,
  last_view timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_since timestamptz := now() - make_interval(days => GREATEST(1, LEAST(365, COALESCE(_days, 30))));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH ev AS (
    SELECT e.event_type,
           e.user_id,
           e.created_at,
           NULLIF(e.payload->>'feature', '')            AS feature,
           NULLIF(e.payload->>'requiredPlanSlug', '')   AS required_plan,
           NULLIF(e.payload->>'durationMs', '')::numeric AS duration_ms
    FROM public.ai_event_log e
    WHERE e.feature = 'gating'
      AND e.created_at >= v_since
      AND e.event_type IN ('locked_route_view','locked_route_cta','locked_route_dwell')
      AND NULLIF(e.payload->>'feature','') IS NOT NULL
  ),
  feats AS (
    SELECT DISTINCT ev.feature FROM ev
  ),
  agg AS (
    SELECT f.feature,
           (SELECT x.required_plan FROM ev x
             WHERE x.feature = f.feature AND x.required_plan IS NOT NULL
             ORDER BY x.created_at DESC LIMIT 1) AS required_plan,
           COUNT(*) FILTER (WHERE v.event_type = 'locked_route_view')                    AS views,
           COUNT(DISTINCT v.user_id) FILTER (WHERE v.event_type = 'locked_route_view')   AS unique_viewers,
           COUNT(*) FILTER (WHERE v.event_type = 'locked_route_cta')                     AS cta_clicks,
           COUNT(DISTINCT v.user_id) FILTER (WHERE v.event_type = 'locked_route_cta')    AS unique_clickers,
           AVG(v.duration_ms) FILTER (WHERE v.event_type = 'locked_route_dwell')         AS avg_dwell_ms,
           percentile_cont(0.5) WITHIN GROUP (
             ORDER BY COALESCE(v.duration_ms, 0)
           ) FILTER (WHERE v.event_type = 'locked_route_dwell')                          AS median_dwell_ms,
           MAX(v.created_at) FILTER (WHERE v.event_type = 'locked_route_view')           AS last_view
    FROM feats f
    JOIN ev v ON v.feature = f.feature
    GROUP BY f.feature
  ),
  conv AS (
    -- Viewers who started a paid subscription after first seeing the locked screen.
    SELECT v.feature, COUNT(DISTINCT v.user_id) AS upgrades
    FROM (
      SELECT ev.feature, ev.user_id, MIN(ev.created_at) AS first_view
      FROM ev
      WHERE ev.event_type = 'locked_route_view' AND ev.user_id IS NOT NULL
      GROUP BY ev.feature, ev.user_id
    ) v
    JOIN public.subscriptions s
      ON s.user_id = v.user_id
     AND s.created_at >= v.first_view
     AND s.status IN ('active','trialing','past_due')
    GROUP BY v.feature
  )
  SELECT a.feature,
         a.required_plan,
         a.views,
         a.unique_viewers,
         a.cta_clicks,
         a.unique_clickers,
         CASE WHEN a.views > 0 THEN ROUND((a.cta_clicks::numeric / a.views) * 100, 1) END,
         ROUND(a.avg_dwell_ms, 0),
         ROUND(a.median_dwell_ms, 0),
         COALESCE(c.upgrades, 0)::bigint,
         CASE WHEN a.unique_viewers > 0
              THEN ROUND((COALESCE(c.upgrades, 0)::numeric / a.unique_viewers) * 100, 1) END,
         a.last_view
  FROM agg a
  LEFT JOIN conv c ON c.feature = a.feature
  ORDER BY a.views DESC, a.feature;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_gating_cta_breakdown(_days integer DEFAULT 30)
RETURNS TABLE(
  feature text,
  cta text,
  clicks bigint,
  unique_clickers bigint,
  share_of_feature_clicks numeric,
  last_click timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_since timestamptz := now() - make_interval(days => GREATEST(1, LEAST(365, COALESCE(_days, 30))));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH clicks AS (
    SELECT NULLIF(e.payload->>'feature','') AS feature,
           COALESCE(NULLIF(e.payload->>'cta',''), 'unknown') AS cta,
           e.user_id, e.created_at
    FROM public.ai_event_log e
    WHERE e.feature = 'gating'
      AND e.event_type = 'locked_route_cta'
      AND e.created_at >= v_since
      AND NULLIF(e.payload->>'feature','') IS NOT NULL
  )
  SELECT c.feature,
         c.cta,
         COUNT(*)::bigint,
         COUNT(DISTINCT c.user_id)::bigint,
         ROUND((COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY c.feature), 0)) * 100, 1),
         MAX(c.created_at)
  FROM clicks c
  GROUP BY c.feature, c.cta
  ORDER BY c.feature, COUNT(*) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_gating_funnel(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_gating_cta_breakdown(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_gating_funnel(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_gating_cta_breakdown(integer) TO authenticated;