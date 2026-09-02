INSERT INTO public.feature_catalog (key, name, description, category, sort_order) VALUES
  ('enterprise.team_management', 'Team & seat management', 'Invite advisors, manage firm seats and roles for your Enterprise team.', 'enterprise', 305)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order;

UPDATE public.subscription_plans p
   SET feature_keys = (
     SELECT ARRAY(
       SELECT DISTINCT unnest(COALESCE(p.feature_keys, ARRAY[]::text[]) || ARRAY['enterprise.team_management'])
     )
   )
 WHERE p.slug IN ('enterprise','advisor','elite');