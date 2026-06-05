-- Live trading is OFF by default until the operating entity is incorporated
-- and the appropriate regulatory licences are in place. Until this flag is
-- enabled, the LIVE order confirm modal is hidden and the `live-trade` edge
-- function refuses to execute even if an intent row exists.
INSERT INTO public.feature_flags (key, enabled, label, description, category)
VALUES (
  'live_trading',
  false,
  'Live trading (broker order placement)',
  'Master kill-switch for real-money order placement. Disabled by default — only enable once the operating entity is incorporated, MiFID II/CONSOB authorisation is in place, and live-trade flows have been re-reviewed.',
  'platform'
)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  category = EXCLUDED.category;
