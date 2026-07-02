ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_run_symbol text,
  ADD COLUMN IF NOT EXISTS first_run_time_to_signal_ms integer,
  ADD COLUMN IF NOT EXISTS first_run_completed_at timestamptz;