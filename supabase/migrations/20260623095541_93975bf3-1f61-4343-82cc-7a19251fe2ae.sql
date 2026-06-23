-- Trigger: enforce single (ai_monthly_quota, ai_model_tier) per tier on subscription_plans.
CREATE OR REPLACE FUNCTION public.enforce_ai_quota_per_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  conflict_quota integer;
  conflict_model text;
BEGIN
  IF NEW.tier IS NULL THEN
    RAISE EXCEPTION 'subscription plan tier cannot be null';
  END IF;

  SELECT ai_monthly_quota, ai_model_tier
    INTO conflict_quota, conflict_model
  FROM public.subscription_plans
  WHERE tier = NEW.tier
    AND id <> NEW.id
    AND (ai_monthly_quota <> NEW.ai_monthly_quota OR ai_model_tier <> NEW.ai_model_tier)
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Tier "%": AI quota mapping conflict. Existing rows use quota=% / model=%, new row uses quota=% / model=%. Each tier must map to exactly one AI quota + model.',
      NEW.tier, conflict_quota, conflict_model, NEW.ai_monthly_quota, NEW.ai_model_tier
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ai_quota_per_tier ON public.subscription_plans;
CREATE TRIGGER trg_enforce_ai_quota_per_tier
  BEFORE INSERT OR UPDATE OF tier, ai_monthly_quota, ai_model_tier
  ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ai_quota_per_tier();

-- Admin-only audit: list tiers missing a mapping or with conflicting mappings.
CREATE OR REPLACE FUNCTION public.admin_check_ai_quota_mapping()
RETURNS TABLE(tier text, issue text, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- 1) Tiers with more than one distinct quota or model mapping.
  RETURN QUERY
    SELECT sp.tier,
           'conflicting_mapping'::text AS issue,
           format(
             'tier "%s" has %s distinct AI quota mappings: quotas=%s, models=%s',
             sp.tier,
             COUNT(*),
             array_agg(DISTINCT sp.ai_monthly_quota ORDER BY sp.ai_monthly_quota)::text,
             array_agg(DISTINCT sp.ai_model_tier ORDER BY sp.ai_model_tier)::text
           ) AS detail
    FROM public.subscription_plans sp
    GROUP BY sp.tier
    HAVING COUNT(DISTINCT sp.ai_monthly_quota) > 1
        OR COUNT(DISTINCT sp.ai_model_tier) > 1;

  -- 2) Active plans missing an AI mapping (quota IS NULL is impossible due to NOT NULL,
  --    but quota = 0 paired with model_tier <> 'none' is a misconfiguration; report it).
  RETURN QUERY
    SELECT sp.tier,
           'misconfigured_mapping'::text AS issue,
           format(
             'tier "%s" plan "%s": ai_monthly_quota=0 but ai_model_tier="%s" — set model_tier to "none" or give the plan a positive quota (or -1 for unlimited)',
             sp.tier, sp.name, sp.ai_model_tier
           ) AS detail
    FROM public.subscription_plans sp
    WHERE sp.ai_monthly_quota = 0
      AND sp.ai_model_tier <> 'none';

  -- 3) Known tiers that should exist but don't (free / plus / pro / elite).
  RETURN QUERY
    SELECT t.tier,
           'missing_tier'::text AS issue,
           format('expected tier "%s" has no row in subscription_plans — admins cannot set its AI quota', t.tier) AS detail
    FROM (VALUES ('free'), ('plus'), ('pro'), ('elite')) AS t(tier)
    WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans sp WHERE sp.tier = t.tier);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_check_ai_quota_mapping() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_check_ai_quota_mapping() FROM anon;