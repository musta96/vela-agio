-- Feature requests captured by the copilot when users ask for missing functionality
CREATE TABLE public.feature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  user_quote TEXT,
  page_context TEXT,
  ai_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'new',
  votes INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users insert own requests" ON public.feature_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users read own requests" ON public.feature_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins read all requests" ON public.feature_requests FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update requests" ON public.feature_requests FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_feature_requests_updated BEFORE UPDATE ON public.feature_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_feature_requests_status ON public.feature_requests(status, created_at DESC);

-- SnapTrade per-user binding (read-only broker sync)
CREATE TABLE public.snaptrade_connections (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  snaptrade_user_id TEXT NOT NULL,
  snaptrade_user_secret TEXT NOT NULL,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.snaptrade_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own snaptrade binding" ON public.snaptrade_connections FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_snaptrade_updated BEFORE UPDATE ON public.snaptrade_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Broker accounts cached from SnapTrade sync
CREATE TABLE public.broker_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  institution TEXT,
  name TEXT,
  currency TEXT,
  cash NUMERIC,
  total_value NUMERIC,
  raw JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, external_id)
);
ALTER TABLE public.broker_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own broker accounts" ON public.broker_accounts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Broker positions cached from SnapTrade sync
CREATE TABLE public.broker_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.broker_accounts(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  name TEXT,
  quantity NUMERIC,
  avg_price NUMERIC,
  market_price NUMERIC,
  market_value NUMERIC,
  currency TEXT,
  raw JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, symbol)
);
ALTER TABLE public.broker_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own broker positions" ON public.broker_positions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_broker_positions_user ON public.broker_positions(user_id);