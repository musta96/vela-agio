CREATE TABLE public.cash_flow_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entry_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  direction text NOT NULL CHECK (direction IN ('income','expense')),
  category text NOT NULL,
  label text,
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'EUR',
  recurring_monthly boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cash_flow_entries_user_date_idx ON public.cash_flow_entries (user_id, entry_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_flow_entries TO authenticated;
GRANT ALL ON public.cash_flow_entries TO service_role;

ALTER TABLE public.cash_flow_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own cash flow entries"
  ON public.cash_flow_entries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own cash flow entries"
  ON public.cash_flow_entries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own cash flow entries"
  ON public.cash_flow_entries FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own cash flow entries"
  ON public.cash_flow_entries FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER cash_flow_entries_set_updated_at
  BEFORE UPDATE ON public.cash_flow_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();