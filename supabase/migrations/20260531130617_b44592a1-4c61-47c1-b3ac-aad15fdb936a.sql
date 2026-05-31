CREATE TABLE public.ai_event_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  event_type TEXT NOT NULL,
  feature TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_event_log_user_idx ON public.ai_event_log (user_id);
CREATE INDEX ai_event_log_type_idx ON public.ai_event_log (event_type);
CREATE INDEX ai_event_log_created_idx ON public.ai_event_log (created_at DESC);

GRANT SELECT, INSERT ON public.ai_event_log TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.ai_event_log_id_seq TO authenticated;
GRANT ALL ON public.ai_event_log TO service_role;
GRANT ALL ON SEQUENCE public.ai_event_log_id_seq TO service_role;

ALTER TABLE public.ai_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own events" ON public.ai_event_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Users read own events" ON public.ai_event_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins read all events" ON public.ai_event_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
