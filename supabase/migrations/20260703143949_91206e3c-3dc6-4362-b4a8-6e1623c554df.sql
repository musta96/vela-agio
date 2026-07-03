
-- Trial lifecycle: reminder & welcome tracking columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_reminder_2d_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_reminder_1d_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_welcome_shown_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_canceled_at timestamptz;

-- Schedule the daily trial-lifecycle worker (runs hourly to catch T-2/T-1 windows across timezones)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule prior version if exists
DO $$ BEGIN
  PERFORM cron.unschedule('trial-lifecycle-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'trial-lifecycle-hourly',
  '17 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pcisxjfgdrgpxzfzfscf.supabase.co/functions/v1/trial-lifecycle-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
