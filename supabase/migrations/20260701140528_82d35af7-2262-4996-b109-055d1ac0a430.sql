
CREATE OR REPLACE FUNCTION public.admin_feature_block_summary(_days int DEFAULT 30)
RETURNS TABLE(feature_key text, blocks bigint, unique_users bigint, last_block timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT b.feature_key,
           COUNT(*)::bigint,
           COUNT(DISTINCT b.user_id)::bigint,
           MAX(b.created_at)
    FROM public.feature_gate_blocks b
    WHERE b.created_at > now() - (_days || ' days')::interval
    GROUP BY b.feature_key
    ORDER BY COUNT(*) DESC
    LIMIT 100;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_feature_block_summary(int) TO authenticated;
