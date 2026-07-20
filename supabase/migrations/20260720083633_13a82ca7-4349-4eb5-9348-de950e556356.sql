-- Register feature keys for premium modules that had no catalog entry, so the
-- route gates added in App.tsx can enforce them (RouteFeatureGate fails open
-- for keys missing from the catalog, so this migration activates those gates).

-- 1) Catalog entries.
INSERT INTO public.feature_catalog (key, name, description, category, sort_order) VALUES
  ('portfolio.optimizer',  'Portfolio optimizer',   'Efficient-frontier optimization and allocation proposals for your holdings.', 'portfolio', 140),
  ('portfolio.rebalance',  'Rebalancing engine',    'Drift analysis and rebalance proposals against your target allocation.',      'portfolio', 150),
  ('research.event_study', 'Event study',           'Measure how similar events moved prices historically.',                       'research',  160),
  ('tax.harvest',          'Tax-loss harvesting',   'Find harvesting opportunities and estimate the tax impact.',                  'portfolio', 170),
  ('quant.alpha',          'Quant Alpha',           'Composite factor scores and systematic alpha signals.',                       'research',  180),
  ('dealflow.access',      'Deal flow',             'IPOs, placements and M&A pipeline with AI screening.',                        'research',  190)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order;

-- 2) Grant to plans: Pro gets the analyst toolkit; Elite/Advisor/Enterprise
--    additionally get Quant Alpha and Deal Flow. Idempotent (distinct-merge),
--    same pattern as 20260703080717.
WITH pro_keys(k) AS (VALUES
  ('portfolio.optimizer'), ('portfolio.rebalance'),
  ('research.event_study'), ('tax.harvest')
),
ent_keys(k) AS (
  SELECT k FROM pro_keys
  UNION ALL VALUES
  ('quant.alpha'), ('dealflow.access')
),
pro_arr AS (SELECT array_agg(k) AS keys FROM pro_keys),
ent_arr AS (SELECT array_agg(k) AS keys FROM ent_keys)
UPDATE public.subscription_plans p
   SET feature_keys = (
     SELECT ARRAY(
       SELECT DISTINCT unnest(COALESCE(p.feature_keys, ARRAY[]::text[]) ||
                              CASE WHEN p.slug IN ('elite','advisor','enterprise')
                                   THEN (SELECT keys FROM ent_arr)
                                   ELSE (SELECT keys FROM pro_arr) END)
     )
   )
 WHERE p.slug IN ('pro','elite','advisor','enterprise');