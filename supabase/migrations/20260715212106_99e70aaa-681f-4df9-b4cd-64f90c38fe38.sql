-- 1) Add paused_from to cash_flow_entries (nullable date; when set, recurring stops from that date)
ALTER TABLE public.cash_flow_entries
  ADD COLUMN IF NOT EXISTS paused_from date;

COMMENT ON COLUMN public.cash_flow_entries.paused_from IS
  'For recurring_monthly entries: month-start date from which projections stop. Null = active.';

-- 2) Budget targets: monthly spending limit per category per user
CREATE TABLE IF NOT EXISTS public.budget_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  monthly_limit numeric(14,2) NOT NULL CHECK (monthly_limit >= 0),
  currency text NOT NULL DEFAULT 'EUR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_targets TO authenticated;
GRANT ALL ON public.budget_targets TO service_role;

ALTER TABLE public.budget_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own budget targets"
  ON public.budget_targets
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER budget_targets_set_updated_at
  BEFORE UPDATE ON public.budget_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();