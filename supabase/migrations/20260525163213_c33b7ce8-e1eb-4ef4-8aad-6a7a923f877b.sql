-- Deduplicate existing rows per (portfolio_id, symbol), keeping the most recently updated
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY portfolio_id, symbol
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
         ) AS rn
  FROM public.portfolio_holdings
  WHERE portfolio_id IS NOT NULL
)
DELETE FROM public.portfolio_holdings ph
USING ranked r
WHERE ph.id = r.id AND r.rn > 1;

-- Add the unique constraint required by upsert(onConflict: "portfolio_id,symbol")
ALTER TABLE public.portfolio_holdings
  ADD CONSTRAINT portfolio_holdings_portfolio_symbol_key
  UNIQUE (portfolio_id, symbol);