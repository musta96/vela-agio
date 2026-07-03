-- Enums for plan / billing cycle / subscription status
DO $$ BEGIN
  CREATE TYPE public.plan_tier AS ENUM ('free','pro_trial','pro','enterprise');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.billing_cycle AS ENUM ('monthly','annual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sub_status AS ENUM ('active','trialing','past_due','canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.retention_discount_type AS ENUM ('percentage','fixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend profiles with resolved billing snapshot
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan public.plan_tier NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS billing_cycle public.billing_cycle,
  ADD COLUMN IF NOT EXISTS subscription_status public.sub_status;

CREATE INDEX IF NOT EXISTS idx_profiles_plan ON public.profiles(plan);

-- Admin-tunable billing settings (single row, id = 1)
CREATE TABLE IF NOT EXISTS public.billing_settings (
  id integer PRIMARY KEY DEFAULT 1,
  trial_length_days integer NOT NULL DEFAULT 7,
  grace_period_days integer NOT NULL DEFAULT 3,
  retention_offer_enabled boolean NOT NULL DEFAULT true,
  retention_discount_type public.retention_discount_type NOT NULL DEFAULT 'percentage',
  retention_discount_value numeric NOT NULL DEFAULT 30,
  retention_duration_months integer NOT NULL DEFAULT 3,
  retention_offer_copy text NOT NULL DEFAULT
    'We''d hate to see you go. Stay on Pro for 30% off the next 3 months — same features, better price.',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_settings_singleton CHECK (id = 1)
);

GRANT SELECT ON public.billing_settings TO authenticated;
GRANT ALL    ON public.billing_settings TO service_role;

ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view billing settings"   ON public.billing_settings;
DROP POLICY IF EXISTS "Admins can update billing settings" ON public.billing_settings;
DROP POLICY IF EXISTS "Admins can insert billing settings" ON public.billing_settings;

CREATE POLICY "Admins can view billing settings"
  ON public.billing_settings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update billing settings"
  ON public.billing_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert billing settings"
  ON public.billing_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND id = 1);

DROP TRIGGER IF EXISTS trg_billing_settings_updated_at ON public.billing_settings;
CREATE TRIGGER trg_billing_settings_updated_at
  BEFORE UPDATE ON public.billing_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed the single row
INSERT INTO public.billing_settings (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
