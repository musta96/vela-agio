
-- alert_rules
CREATE TABLE public.alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL, -- 'price_above','price_below','change_up_pct','change_down_pct','rsi_overbought','rsi_oversold','macd_cross','breakout_52w','ma_cross','smart_pick_change','portfolio_drawdown','portfolio_concentration'
  symbol text,        -- nullable for portfolio-wide rules
  name text,
  threshold numeric,  -- value the rule triggers at
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  notify_email_immediate boolean NOT NULL DEFAULT false,
  cooldown_minutes integer NOT NULL DEFAULT 60,
  last_fired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_alert_rules_user ON public.alert_rules(user_id);
CREATE INDEX idx_alert_rules_enabled ON public.alert_rules(enabled) WHERE enabled = true;

ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own alert rules" ON public.alert_rules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own alert rules" ON public.alert_rules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own alert rules" ON public.alert_rules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own alert rules" ON public.alert_rules FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_alert_rules_updated
  BEFORE UPDATE ON public.alert_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  rule_id uuid REFERENCES public.alert_rules(id) ON DELETE SET NULL,
  kind text NOT NULL,
  symbol text,
  title text NOT NULL,
  body text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'info', -- info, warning, critical
  read_at timestamptz,
  emailed_at timestamptz,
  digested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_pending_digest ON public.notifications(user_id) WHERE digested_at IS NULL AND emailed_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own notifications" ON public.notifications FOR DELETE USING (auth.uid() = user_id);
-- inserts are server-side only (service role bypasses RLS)

-- alert_preferences (1 row per user)
CREATE TABLE public.alert_preferences (
  user_id uuid PRIMARY KEY,
  email_enabled boolean NOT NULL DEFAULT true,
  daily_digest_enabled boolean NOT NULL DEFAULT true,
  digest_hour_utc smallint NOT NULL DEFAULT 7, -- ~9am Rome
  immediate_only_critical boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.alert_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own prefs" ON public.alert_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users upsert own prefs" ON public.alert_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own prefs" ON public.alert_preferences FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER trg_alert_preferences_updated
  BEFORE UPDATE ON public.alert_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
