CREATE OR REPLACE FUNCTION public.admin_gating_plan_breakdown(_days integer DEFAULT 30)
 RETURNS TABLE(feature text, source_plan text, required_plan text, views bigint, unique_viewers bigint, cta_clicks bigint, unique_clickers bigint, ctr numeric, avg_dwell_ms numeric, median_dwell_ms numeric, upgrades bigint, conversion_rate numeric, ctas jsonb, last_view timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
           NULLIF(e.payload->>'feature','')                    AS feature,
           COALESCE(NULLIF(e.payload->>'planSlug',''), 'free') AS source_plan,
           NULLIF(e.payload->>'requiredPlanSlug','')           AS required_plan,
           COALESCE(NULLIF(e.payload->>'cta',''), 'unknown')   AS cta,
           NULLIF(e.payload->>'durationMs','')::numeric        AS duration_ms
    FROM public.ai_event_log e
    WHERE e.feature = 'gating'
      AND e.created_at >= v_since
      AND e.event_type IN ('locked_route_view','locked_route_cta','locked_route_dwell')
      AND NULLIF(e.payload->>'feature','') IS NOT NULL
  ),
  agg AS (
    SELECT v.feature,
           v.source_plan,
           (array_agg(v.required_plan ORDER BY v.created_at DESC)
              FILTER (WHERE v.required_plan IS NOT NULL))[1]                       AS required_plan,
           COUNT(*) FILTER (WHERE v.event_type = 'locked_route_view')              AS views,
           COUNT(DISTINCT v.user_id) FILTER (WHERE v.event_type = 'locked_route_view')  AS unique_viewers,
           COUNT(*) FILTER (WHERE v.event_type = 'locked_route_cta')               AS cta_clicks,
           COUNT(DISTINCT v.user_id) FILTER (WHERE v.event_type = 'locked_route_cta')   AS unique_clickers,
           AVG(v.duration_ms) FILTER (WHERE v.event_type = 'locked_route_dwell')   AS avg_dwell_ms,
           percentile_cont(0.5) WITHIN GROUP (
             ORDER BY COALESCE(v.duration_ms, 0)::double precision
           ) FILTER (WHERE v.event_type = 'locked_route_dwell')::numeric           AS median_dwell_ms,
           MAX(v.created_at) FILTER (WHERE v.event_type = 'locked_route_view')     AS last_view
    FROM ev v
    GROUP BY v.feature, v.source_plan
  ),
  cta_agg AS (
    SELECT c.feature, c.source_plan,
           jsonb_agg(jsonb_build_object('cta', c.cta, 'clicks', c.clicks, 'unique_clickers', c.uniq)
                     ORDER BY c.clicks DESC) AS ctas
    FROM (
      SELECT ev.feature, ev.source_plan, ev.cta,
             COUNT(*)::bigint AS clicks,
             COUNT(DISTINCT ev.user_id)::bigint AS uniq
      FROM ev
      WHERE ev.event_type = 'locked_route_cta'
      GROUP BY ev.feature, ev.source_plan, ev.cta
    ) c
    GROUP BY c.feature, c.source_plan
  ),
  conv AS (
    SELECT v.feature, v.source_plan, COUNT(DISTINCT v.user_id)::bigint AS upgrades
    FROM (
      SELECT ev.feature, ev.source_plan, ev.user_id, MIN(ev.created_at) AS first_view
      FROM ev
      WHERE ev.event_type = 'locked_route_view' AND ev.user_id IS NOT NULL
      GROUP BY ev.feature, ev.source_plan, ev.user_id
    ) v
    JOIN public.subscriptions s
      ON s.user_id = v.user_id
     AND s.created_at >= v.first_view
     AND s.status IN ('active','trialing','past_due')
    GROUP BY v.feature, v.source_plan
  )
  SELECT a.feature,
         a.source_plan,
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
         COALESCE(ca.ctas, '[]'::jsonb),
         a.last_view
  FROM agg a
  LEFT JOIN conv c ON c.feature = a.feature AND c.source_plan = a.source_plan
  LEFT JOIN cta_agg ca ON ca.feature = a.feature AND ca.source_plan = a.source_plan
  ORDER BY a.views DESC, a.feature, a.source_plan;
END;
$function$;