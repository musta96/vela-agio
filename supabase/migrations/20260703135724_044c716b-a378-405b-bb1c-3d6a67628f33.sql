
ALTER TABLE public.alert_preferences
  ADD COLUMN IF NOT EXISTS daily_brief_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS daily_brief_push boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS daily_brief_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS daily_brief_hour_local smallint NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS daily_brief_timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS daily_brief_last_sent_on date;

ALTER TABLE public.alert_preferences
  ADD CONSTRAINT alert_preferences_brief_hour_range CHECK (daily_brief_hour_local BETWEEN 0 AND 23);

CREATE TABLE IF NOT EXISTS public.daily_brief_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  as_of_date date NOT NULL,
  change_pct numeric,
  insight text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol, as_of_date)
);

GRANT SELECT ON public.daily_brief_insights TO authenticated;
GRANT ALL ON public.daily_brief_insights TO service_role;
ALTER TABLE public.daily_brief_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brief insights readable to signed-in users"
  ON public.daily_brief_insights FOR SELECT TO authenticated USING (true);
