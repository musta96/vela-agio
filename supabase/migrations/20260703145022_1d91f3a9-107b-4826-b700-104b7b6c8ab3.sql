
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS past_due_since timestamptz,
  ADD COLUMN IF NOT EXISTS dunning_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reverted_to_free_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_past_due ON public.profiles(past_due_since) WHERE past_due_since IS NOT NULL;
