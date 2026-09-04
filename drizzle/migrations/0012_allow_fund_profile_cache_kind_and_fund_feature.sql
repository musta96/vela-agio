ALTER TABLE public.market_data_cache DROP CONSTRAINT market_data_cache_kind_check;
ALTER TABLE public.market_data_cache ADD CONSTRAINT market_data_cache_kind_check
  CHECK (kind = ANY (ARRAY['quote','ohlc','fx','quoteSummary','peers','company-profile','fund-profile']));

INSERT INTO public.feature_catalog (key, name, description, category, sort_order)
VALUES ('fund.deep_data', 'ETF & fund deep data',
        'Full holdings, sector and asset breakdowns, multi-year performance vs category, risk statistics, fee comparison and distribution history for ETFs and funds.',
        'markets', 999)
ON CONFLICT (key) DO NOTHING;

UPDATE public.subscription_plans
SET feature_keys = array_append(feature_keys, 'fund.deep_data')
WHERE slug IN ('plus','pro','advisor','elite','enterprise')
  AND NOT ('fund.deep_data' = ANY (feature_keys));