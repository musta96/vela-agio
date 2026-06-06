
INSERT INTO public.feature_flags (key, enabled, label, description, category)
VALUES (
  'show_recommendation_verdicts',
  false,
  'Show recommendation verdicts',
  'When ON, AI-blended Buy/Hold/Sell verdicts and action wording are shown. When OFF (default), all surfaces render descriptive read-outs only (no buy/hold/sell label, no horizon, no sizing instruction).',
  'compliance'
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS recommendation_verdicts_override text NOT NULL DEFAULT 'inherit';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_recommendation_verdicts_override_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_recommendation_verdicts_override_check
  CHECK (recommendation_verdicts_override IN ('inherit', 'on', 'off'));
