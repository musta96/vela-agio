
-- 1. Clean up market_data_cache policies for clarity
DROP POLICY IF EXISTS "No client writes" ON public.market_data_cache;

CREATE POLICY "Deny client inserts" ON public.market_data_cache
  FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "Deny client updates" ON public.market_data_cache
  FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny client deletes" ON public.market_data_cache
  FOR DELETE TO authenticated, anon USING (false);

-- 2. Lock down SECURITY DEFINER / trigger functions from direct API execution.
-- has_role is used inside RLS policies (runs as table owner), so it does not
-- need EXECUTE for anon/authenticated. set_updated_at and handle_new_user are
-- trigger-only.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
