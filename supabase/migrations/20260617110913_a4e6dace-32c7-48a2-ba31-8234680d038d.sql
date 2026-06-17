
-- 1) ai_output_cache: block all client writes
DROP POLICY IF EXISTS "Deny client inserts" ON public.ai_output_cache;
DROP POLICY IF EXISTS "Deny client updates" ON public.ai_output_cache;
DROP POLICY IF EXISTS "Deny client deletes" ON public.ai_output_cache;
CREATE POLICY "Deny client inserts" ON public.ai_output_cache
  FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "Deny client updates" ON public.ai_output_cache
  FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny client deletes" ON public.ai_output_cache
  FOR DELETE TO authenticated, anon USING (false);

-- 2) admin_sessions: make the no-client-write intent explicit
DROP POLICY IF EXISTS "Deny client inserts" ON public.admin_sessions;
DROP POLICY IF EXISTS "Deny client updates" ON public.admin_sessions;
DROP POLICY IF EXISTS "Deny client deletes" ON public.admin_sessions;
CREATE POLICY "Deny client inserts" ON public.admin_sessions
  FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "Deny client updates" ON public.admin_sessions
  FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny client deletes" ON public.admin_sessions
  FOR DELETE TO authenticated, anon USING (false);

-- 3) tenant_settings: allow admin/compliance read for oversight
DROP POLICY IF EXISTS "Admins and compliance read tenant settings" ON public.tenant_settings;
CREATE POLICY "Admins and compliance read tenant settings" ON public.tenant_settings
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compliance'::app_role));
