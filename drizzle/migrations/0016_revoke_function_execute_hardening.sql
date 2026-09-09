-- Harden SECURITY DEFINER / internal function EXECUTE privileges.
-- Revoke anon + authenticated EXECUTE from functions that are never called
-- by clients (trigger functions, service-role-only helpers, admin internals
-- that already re-check has_role and are only invoked from the owner console
-- by authenticated admins -- those keep authenticated but lose anon).

-- 1) Trigger-only functions: nobody should EXECUTE these directly.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.advisory_consents_revoke_only() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_ai_quota_per_tier() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_firm_seat_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_firm_seat_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_profile_entitlements() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.snapshot_trading_strategy() FROM PUBLIC, anon, authenticated;

-- 2) Service-role-only helpers (used by edge functions, never by clients).
REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_margin_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_margin_summary() TO service_role;

-- 3) Admin / owner-console RPCs: keep authenticated (they enforce
--    has_role(admin) internally and are called from the admin UI),
--    but anonymous callers never need them.
REVOKE EXECUTE ON FUNCTION public.admin_check_ai_quota_mapping() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_feature_block_summary(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_feature_block_summary(timestamp with time zone) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_gating_cta_breakdown(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_gating_funnel(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_gating_plan_breakdown(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_blog_leads() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_blog_posts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_new_enterprise_leads_count() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_referral_analytics() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_referral_redemption_log(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_retention_audit(timestamp with time zone) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_retention_events(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_revenue_overview(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_rls_audit() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_subscriptions_missing_plan(text) FROM PUBLIC, anon;

-- 4) Signed-in-only RPCs and per-user helpers: anonymous callers never need these.
REVOKE EXECUTE ON FUNCTION public.check_paid_plans_stripe_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_retention_offer() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.redeem_referral_code(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.lookup_referral_code(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_advisory_consent(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_active_mandate(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ai_usage_this_month(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ai_credits_this_month(uuid) FROM PUBLIC, anon;

-- NOTE: the following SECURITY DEFINER functions intentionally keep anon
-- EXECUTE because anonymous RLS policies or public flows invoke them:
--   has_role (restrictive user_roles policy applies to anon),
--   has_feature / has_pro_access / has_active_subscription / is_firm_member /
--   is_firm_owner (RLS policy helpers), get_enabled_feature_flags (public
--   feature flags on the pre-login landing page), my_entitlements (explicit
--   anonymous branch), unlock_blog_post (public blog gate).
