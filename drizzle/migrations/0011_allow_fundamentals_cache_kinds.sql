ALTER TABLE public.market_data_cache DROP CONSTRAINT market_data_cache_kind_check;
ALTER TABLE public.market_data_cache ADD CONSTRAINT market_data_cache_kind_check
  CHECK (kind = ANY (ARRAY['quote','ohlc','fx','quoteSummary','peers','company-profile']));