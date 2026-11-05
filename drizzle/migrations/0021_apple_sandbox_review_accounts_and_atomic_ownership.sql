CREATE TABLE public.apple_test_accounts(user_id uuid PRIMARY KEY);
GRANT ALL ON public.apple_test_accounts TO service_role;
ALTER TABLE public.apple_test_accounts ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.apple_environment_allowed(_user_id uuid,_environment text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT _environment='live' OR (_environment='sandbox' AND EXISTS(SELECT 1 FROM public.apple_test_accounts WHERE user_id=_user_id)); $$;
REVOKE ALL ON FUNCTION public.apple_environment_allowed(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apple_environment_allowed(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.has_feature(_user_id uuid,_key text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT public.stripe_has_feature(_user_id,_key) OR EXISTS(SELECT 1 FROM public.apple_subscriptions a JOIN public.subscription_plans p ON p.slug=a.plan_slug WHERE a.user_id=_user_id AND public.apple_environment_allowed(_user_id,a.environment) AND a.gives_access AND a.expires_at>now() AND _key=ANY(p.feature_keys)); $$;
CREATE OR REPLACE FUNCTION public.my_entitlements() RETURNS TABLE(tier text,plan_slug text,plan_name text,feature_keys text[],beta_active boolean,source text,max_portfolios integer,max_positions_per_portfolio integer,max_watchlist integer,max_ai_questions_per_month integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE base record; apple record; keys text[]; found_apple boolean;
BEGIN
SELECT * INTO base FROM public.stripe_entitlements();
SELECT p.* INTO apple FROM public.apple_subscriptions a JOIN public.subscription_plans p ON p.slug=a.plan_slug WHERE a.user_id=auth.uid() AND public.apple_environment_allowed(a.user_id,a.environment) AND a.gives_access AND a.expires_at>now() ORDER BY a.expires_at DESC LIMIT 1;
found_apple:=FOUND;
IF found_apple THEN
 SELECT array_agg(DISTINCT k) INTO keys FROM unnest(COALESCE(base.feature_keys,ARRAY[]::text[]) || COALESCE(apple.feature_keys,ARRAY[]::text[])) k;
 IF base.source <> 'subscription' OR base.plan_slug IN ('free','explorer','plus') THEN
 RETURN QUERY SELECT apple.tier::text,apple.slug::text,apple.name::text,COALESCE(keys,ARRAY[]::text[]),base.beta_active,'subscription'::text,apple.max_portfolios,apple.max_positions_per_portfolio,apple.max_watchlist,apple.max_ai_questions_per_month;
 ELSE RETURN QUERY SELECT base.tier,base.plan_slug,base.plan_name,COALESCE(keys,ARRAY[]::text[]),base.beta_active,base.source,base.max_portfolios,base.max_positions_per_portfolio,base.max_watchlist,base.max_ai_questions_per_month; END IF;
ELSE RETURN QUERY SELECT base.tier,base.plan_slug,base.plan_name,base.feature_keys,base.beta_active,base.source,base.max_portfolios,base.max_positions_per_portfolio,base.max_watchlist,base.max_ai_questions_per_month; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.apple_reconcile_subscriptions(_user_id uuid,_rows jsonb,_verified_at timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text,0));
 IF EXISTS(SELECT 1 FROM public.apple_subscriptions WHERE user_id=_user_id AND verified_at>_verified_at) THEN RETURN; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(_rows) ORDER BY value->>'original_transaction_id' LOOP
 PERFORM pg_advisory_xact_lock(hashtextextended((r->>'original_transaction_id') || ':' || (r->>'environment'),1));
 IF EXISTS(SELECT 1 FROM public.apple_subscriptions WHERE (id=r->>'id' OR (original_transaction_id=r->>'original_transaction_id' AND environment=r->>'environment')) AND user_id<>_user_id) THEN RAISE EXCEPTION 'purchase_owned_by_another_account'; END IF;
 END LOOP;
 UPDATE public.apple_subscriptions SET gives_access=false,verified_at=_verified_at WHERE user_id=_user_id;
 FOR r IN SELECT value FROM jsonb_array_elements(_rows) LOOP
 INSERT INTO public.apple_subscriptions(id,user_id,original_transaction_id,product_id,environment,status,gives_access,current_period_start,expires_at,will_renew,verified_at)
 VALUES(r->>'id',_user_id,r->>'original_transaction_id',r->>'product_id',r->>'environment',r->>'status',(r->>'gives_access')::boolean,(r->>'current_period_start')::timestamptz,(r->>'expires_at')::timestamptz,(r->>'will_renew')::boolean,_verified_at)
 ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,gives_access=EXCLUDED.gives_access,current_period_start=EXCLUDED.current_period_start,expires_at=EXCLUDED.expires_at,will_renew=EXCLUDED.will_renew,verified_at=EXCLUDED.verified_at;
 END LOOP;
END $$;