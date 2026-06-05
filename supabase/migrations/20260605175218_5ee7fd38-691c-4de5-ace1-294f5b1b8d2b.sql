INSERT INTO public.feature_flags (key, enabled, label, description, category)
VALUES ('live_trading', false, 'Live order routing', 'Allow Vela to submit real-money orders to a connected broker (Alpaca / IBKR). MUST stay OFF until the operating entity is a regulated investment firm.', 'trading')
ON CONFLICT (key) DO UPDATE SET enabled = false, label = EXCLUDED.label, description = EXCLUDED.description, category = EXCLUDED.category;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_opt_out boolean NOT NULL DEFAULT false;