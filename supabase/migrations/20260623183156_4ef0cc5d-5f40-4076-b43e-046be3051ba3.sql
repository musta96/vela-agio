-- referral_codes
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text,
  description text,
  kind text NOT NULL DEFAULT 'discount' CHECK (kind IN ('beta','discount')),
  percent_off integer CHECK (percent_off IS NULL OR (percent_off > 0 AND percent_off <= 100)),
  stripe_coupon_id text,
  plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  max_uses integer,
  uses_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_codes TO authenticated;
GRANT ALL ON public.referral_codes TO service_role;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage referral_codes" ON public.referral_codes;
CREATE POLICY "admins manage referral_codes" ON public.referral_codes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS set_referral_codes_updated_at ON public.referral_codes;
CREATE TRIGGER set_referral_codes_updated_at
  BEFORE UPDATE ON public.referral_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- referral_redemptions
CREATE TABLE IF NOT EXISTS public.referral_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES public.referral_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  kind text NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(code_id, user_id)
);

GRANT SELECT ON public.referral_redemptions TO authenticated;
GRANT ALL ON public.referral_redemptions TO service_role;
ALTER TABLE public.referral_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see own redemptions" ON public.referral_redemptions;
CREATE POLICY "users see own redemptions" ON public.referral_redemptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "admins see all redemptions" ON public.referral_redemptions;
CREATE POLICY "admins see all redemptions" ON public.referral_redemptions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Redeem RPC
CREATE OR REPLACE FUNCTION public.redeem_referral_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.referral_codes;
  v_inserted boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'must be signed in to redeem' USING ERRCODE = '28000'; END IF;
  IF _code IS NULL OR length(btrim(_code)) = 0 THEN RAISE EXCEPTION 'code required'; END IF;

  SELECT * INTO v_row FROM public.referral_codes
   WHERE upper(code) = upper(btrim(_code))
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'code not found'; END IF;
  IF NOT v_row.active THEN RAISE EXCEPTION 'code disabled'; END IF;
  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN RAISE EXCEPTION 'code expired'; END IF;
  IF v_row.max_uses IS NOT NULL AND v_row.uses_count >= v_row.max_uses THEN RAISE EXCEPTION 'code exhausted'; END IF;

  INSERT INTO public.referral_redemptions (code_id, user_id, plan_id, kind)
  VALUES (v_row.id, v_uid, v_row.plan_id, v_row.kind)
  ON CONFLICT (code_id, user_id) DO NOTHING
  RETURNING true INTO v_inserted;

  IF v_inserted THEN
    UPDATE public.referral_codes SET uses_count = uses_count + 1 WHERE id = v_row.id;
  END IF;

  IF v_row.kind = 'beta' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, 'beta_tester'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'kind', v_row.kind, 'percent_off', v_row.percent_off,
    'stripe_coupon_id', v_row.stripe_coupon_id, 'plan_id', v_row.plan_id, 'label', v_row.label
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.redeem_referral_code(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.redeem_referral_code(text) TO authenticated, service_role;

-- Lookup RPC for discount preview / checkout edge function
CREATE OR REPLACE FUNCTION public.lookup_referral_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.referral_codes;
BEGIN
  SELECT * INTO v_row FROM public.referral_codes
    WHERE upper(code) = upper(btrim(_code));
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  RETURN jsonb_build_object(
    'found', true, 'kind', v_row.kind, 'active', v_row.active,
    'expired', v_row.expires_at IS NOT NULL AND v_row.expires_at < now(),
    'exhausted', v_row.max_uses IS NOT NULL AND v_row.uses_count >= v_row.max_uses,
    'percent_off', v_row.percent_off, 'stripe_coupon_id', v_row.stripe_coupon_id,
    'plan_id', v_row.plan_id, 'label', v_row.label
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.lookup_referral_code(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lookup_referral_code(text) TO authenticated, service_role;

-- Beta tester bypass everywhere
CREATE OR REPLACE FUNCTION public.has_feature(_user_id uuid, _key text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.has_role(_user_id, 'beta_tester'::app_role) OR EXISTS (
    SELECT 1 FROM public.subscriptions s
    JOIN public.subscription_plans p
      ON (p.stripe_monthly_price_id = s.price_id OR p.stripe_yearly_price_id = s.price_id)
    WHERE s.user_id = _user_id
      AND ((s.status IN ('active','trialing','past_due')
              AND (s.current_period_end IS NULL OR s.current_period_end > now()))
        OR (s.status = 'canceled' AND s.current_period_end > now()))
      AND _key = ANY(p.feature_keys)
  );
$function$;

CREATE OR REPLACE FUNCTION public.has_active_subscription(user_uuid uuid, check_env text DEFAULT 'live'::text)
 RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.has_role(user_uuid, 'beta_tester'::app_role) OR exists (
    select 1 from public.subscriptions
    where user_id = user_uuid AND environment = check_env
    AND ((status in ('active','trialing') AND (current_period_end is null OR current_period_end > now()))
      OR (status = 'canceled' AND current_period_end > now()))
  );
$function$;

CREATE OR REPLACE FUNCTION public.my_entitlements()
 RETURNS TABLE(tier text, plan_slug text, plan_name text, feature_keys text[])
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'beta_tester'::app_role) THEN
    RETURN QUERY SELECT
      'beta'::text, 'beta-tester'::text, 'Beta tester'::text,
      COALESCE((SELECT array_agg(key) FROM public.feature_catalog), ARRAY[]::text[]);
    RETURN;
  END IF;
  RETURN QUERY
    SELECT coalesce(p.tier,'free'), p.slug, p.name, coalesce(p.feature_keys, ARRAY[]::text[])
    FROM public.subscriptions s
    LEFT JOIN public.subscription_plans p
      ON (p.stripe_monthly_price_id = s.price_id OR p.stripe_yearly_price_id = s.price_id)
    WHERE s.user_id = auth.uid()
      AND ((s.status IN ('active','trialing','past_due')
              AND (s.current_period_end IS NULL OR s.current_period_end > now()))
        OR (s.status = 'canceled' AND s.current_period_end > now()))
    ORDER BY s.created_at DESC LIMIT 1;
END;
$function$;