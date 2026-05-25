
-- Net Worth Tracker
CREATE TABLE public.net_worth_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL, -- cash, investments, real_estate, vehicles, collectibles, private_equity, crypto, retirement, other_assets, liabilities
  subcategory text,
  currency text NOT NULL DEFAULT 'EUR',
  icon text,
  notes text,
  linked_portfolio_ids uuid[] DEFAULT '{}'::uuid[], -- live value from one or many Vela portfolios
  manual_value numeric DEFAULT 0, -- used when no portfolio link
  is_liability boolean NOT NULL DEFAULT false,
  include_in_total boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.net_worth_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own nw accounts" ON public.net_worth_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own nw accounts" ON public.net_worth_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own nw accounts" ON public.net_worth_accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own nw accounts" ON public.net_worth_accounts FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER nw_accounts_updated_at BEFORE UPDATE ON public.net_worth_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.net_worth_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.net_worth_accounts(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  value numeric NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, snapshot_date)
);

ALTER TABLE public.net_worth_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own nw snapshots" ON public.net_worth_snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own nw snapshots" ON public.net_worth_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own nw snapshots" ON public.net_worth_snapshots FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own nw snapshots" ON public.net_worth_snapshots FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_nw_accounts_user ON public.net_worth_accounts(user_id);
CREATE INDEX idx_nw_snapshots_user_date ON public.net_worth_snapshots(user_id, snapshot_date);
