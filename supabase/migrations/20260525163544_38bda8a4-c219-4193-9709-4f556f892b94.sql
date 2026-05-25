
-- 1. For each (user_id, name), pick oldest as keeper
WITH ranked AS (
  SELECT id, user_id, name,
         row_number() OVER (PARTITION BY user_id, name ORDER BY created_at ASC) AS rn,
         first_value(id) OVER (PARTITION BY user_id, name ORDER BY created_at ASC) AS keeper_id
  FROM public.portfolios
),
dupes AS (
  SELECT id AS dup_id, keeper_id FROM ranked WHERE rn > 1
)
-- 2. Move holdings to keeper (ignore conflicts on unique constraint)
UPDATE public.portfolio_holdings h
SET portfolio_id = d.keeper_id
FROM dupes d
WHERE h.portfolio_id = d.dup_id
  AND NOT EXISTS (
    SELECT 1 FROM public.portfolio_holdings h2
    WHERE h2.portfolio_id = d.keeper_id AND h2.symbol = h.symbol
  );

-- 3. Delete leftover duplicate holdings, then duplicate portfolios
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id, name ORDER BY created_at ASC) AS rn
  FROM public.portfolios
)
DELETE FROM public.portfolio_holdings
WHERE portfolio_id IN (SELECT id FROM ranked WHERE rn > 1);

WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id, name ORDER BY created_at ASC) AS rn
  FROM public.portfolios
)
DELETE FROM public.portfolios
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 4. Prevent future duplicates
ALTER TABLE public.portfolios
  ADD CONSTRAINT portfolios_user_name_key UNIQUE (user_id, name);
