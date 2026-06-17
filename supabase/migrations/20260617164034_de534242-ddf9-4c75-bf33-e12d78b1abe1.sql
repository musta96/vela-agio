
DROP POLICY IF EXISTS "Users insert own events" ON public.ai_event_log;
CREATE POLICY "Users insert own events"
  ON public.ai_event_log
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
