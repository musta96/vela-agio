
ALTER TABLE public.portfolios
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

-- Only one primary per user
CREATE UNIQUE INDEX IF NOT EXISTS portfolios_one_primary_per_user
  ON public.portfolios (user_id)
  WHERE is_primary;

-- Backfill: oldest portfolio per user becomes primary
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id ORDER BY created_at ASC) AS rn
  FROM public.portfolios
)
UPDATE public.portfolios p
SET is_primary = true
FROM ranked r
WHERE p.id = r.id AND r.rn = 1
  AND NOT EXISTS (
    SELECT 1 FROM public.portfolios p2
    WHERE p2.user_id = p.user_id AND p2.is_primary = true
  );
