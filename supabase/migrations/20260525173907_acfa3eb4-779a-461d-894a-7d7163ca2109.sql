
-- Platform-wide kill switches and config (singleton-style key/value)
CREATE TABLE public.platform_controls (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT false,
  reason text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read controls" ON public.platform_controls FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage controls" ON public.platform_controls FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed standard switches (all OFF by default)
INSERT INTO public.platform_controls (key, enabled, reason) VALUES
  ('maintenance_mode', false, null),
  ('ai_signals_halted', false, null),
  ('emails_paused', false, null),
  ('signups_disabled', false, null),
  ('live_trading_disabled', false, null),
  ('data_feeds_frozen', false, null)
ON CONFLICT (key) DO NOTHING;

-- Announcement banners
CREATE TABLE public.platform_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
ALTER TABLE public.platform_banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read banners" ON public.platform_banners FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage banners" ON public.platform_banners FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Append-only AI signal/output log
CREATE TABLE public.ai_signal_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  signal_type text NOT NULL,
  symbol text,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  disclaimer text,
  confidence numeric,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','retracted','flagged','suppressed')),
  retracted_by uuid,
  retracted_reason text,
  retracted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_signal_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read ai signals" ON public.ai_signal_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users read own ai signals" ON public.ai_signal_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- writes only via service role / edge functions
CREATE INDEX ai_signal_log_created_idx ON public.ai_signal_log (created_at DESC);
CREATE INDEX ai_signal_log_status_idx ON public.ai_signal_log (status);

-- Incident log (immutable by RLS — no update/delete policies)
CREATE TABLE public.incident_log (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_email text,
  category text NOT NULL,
  action text NOT NULL,
  reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.incident_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read incidents" ON public.incident_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- User suspensions
CREATE TABLE public.user_suspensions (
  user_id uuid PRIMARY KEY,
  reason text,
  suspended_by uuid,
  suspended_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_suspensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage suspensions" ON public.user_suspensions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users read own suspension" ON public.user_suspensions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
