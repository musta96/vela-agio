REVOKE EXECUTE ON FUNCTION public.ai_usage_this_month(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_this_month(uuid) TO service_role;