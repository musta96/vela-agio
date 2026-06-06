CREATE TABLE public.pdf_export_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  filename TEXT,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pdf_export_log_user_created_idx ON public.pdf_export_log(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.pdf_export_log TO authenticated;
GRANT ALL ON public.pdf_export_log TO service_role;
ALTER TABLE public.pdf_export_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own exports" ON public.pdf_export_log FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own exports" ON public.pdf_export_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);