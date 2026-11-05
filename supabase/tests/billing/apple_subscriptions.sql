-- Run in a privileged isolated test session. All synthetic data rolls back.
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE uid uuid := '00000000-0000-4000-8000-000000000091';
 other_uid uuid := '00000000-0000-4000-8000-000000000092';
 t timestamptz := now(); rows jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM public.subscription_plans WHERE slug IN ('plus','pro','enterprise') AND NOT feature_keys @> ARRAY['ai.backtests','strategy.proposal_builder','strategy.lab','backtest.costs','backtest.advanced','backtest.events']) THEN RAISE EXCEPTION 'Paid strategy features missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.subscription_plans WHERE slug IN ('free','explorer') AND feature_keys @> ARRAY['ai.backtests']) THEN RAISE EXCEPTION 'Explorer backtesting must stay denied'; END IF;
 rows := jsonb_build_array(jsonb_build_object('id','apple-test-s','original_transaction_id','apple-test-t','product_id','vela_pro_monthly','environment','live','status','active','gives_access',true,'current_period_start',t,'expires_at',t+interval '1 day','will_renew',false));
 PERFORM public.apple_reconcile_subscriptions(uid,rows,t);
 IF NOT public.has_feature(uid,'ai.backtests') THEN RAISE EXCEPTION 'Cancelled renewal must preserve paid period access'; END IF;
 PERFORM public.apple_reconcile_subscriptions(uid,rows,t);
 IF (SELECT count(*) FROM public.apple_subscriptions WHERE user_id=uid) <> 1 THEN RAISE EXCEPTION 'Duplicate reconciliation'; END IF;
 PERFORM public.apple_reconcile_subscriptions(uid,'[]'::jsonb,t-interval '1 second');
 IF NOT public.has_feature(uid,'ai.backtests') THEN RAISE EXCEPTION 'Stale state overwrote current subscription'; END IF;
 BEGIN
  PERFORM public.apple_reconcile_subscriptions(other_uid,rows,t+interval '1 second');
  RAISE EXCEPTION 'Ownership claim unexpectedly succeeded';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'purchase_owned_by_another_account' THEN RAISE; END IF;
 END;
 UPDATE public.apple_subscriptions SET expires_at=t-interval '1 second' WHERE user_id=uid;
 IF public.has_feature(uid,'ai.backtests') THEN RAISE EXCEPTION 'Expired subscription grants access'; END IF;
 UPDATE public.apple_subscriptions SET expires_at=t+interval '1 day',environment='sandbox' WHERE user_id=uid;
 IF public.has_feature(uid,'ai.backtests') THEN RAISE EXCEPTION 'Sandbox leaked into production'; END IF;
 INSERT INTO public.apple_test_accounts(user_id) VALUES(uid);
 IF NOT public.has_feature(uid,'ai.backtests') THEN RAISE EXCEPTION 'Allowlisted sandbox tester has no access'; END IF;
 UPDATE public.apple_subscriptions SET gives_access=false WHERE user_id=uid;
 IF public.has_feature(uid,'ai.backtests') THEN RAISE EXCEPTION 'Revoked subscription grants access'; END IF;
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 PERFORM * FROM public.my_entitlements();
END $$;
ROLLBACK;