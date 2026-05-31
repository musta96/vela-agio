
-- Add variant column to landing_sections (default variant 'A' = control)
ALTER TABLE public.landing_sections ADD COLUMN IF NOT EXISTS variant text NOT NULL DEFAULT 'A';
ALTER TABLE public.landing_sections DROP CONSTRAINT IF EXISTS landing_sections_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS landing_sections_key_variant_uniq ON public.landing_sections(key, variant);

-- Snapshots / version history
CREATE TABLE IF NOT EXISTS public.landing_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  note text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_versions TO authenticated;
GRANT ALL ON public.landing_versions TO service_role;
ALTER TABLE public.landing_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage landing versions" ON public.landing_versions
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

-- Reusable global tokens / fields
CREATE TABLE IF NOT EXISTS public.landing_globals (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '""'::jsonb,
  label text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.landing_globals TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_globals TO authenticated;
GRANT ALL ON public.landing_globals TO service_role;
ALTER TABLE public.landing_globals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read landing globals" ON public.landing_globals FOR SELECT USING (true);
CREATE POLICY "Admins write landing globals (i)" ON public.landing_globals
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins write landing globals (u)" ON public.landing_globals
  FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins write landing globals (d)" ON public.landing_globals
  FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

-- SEO config + A/B test config (single-row settings)
CREATE TABLE IF NOT EXISTS public.landing_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  seo jsonb NOT NULL DEFAULT '{}'::jsonb,
  ab jsonb NOT NULL DEFAULT '{"enabled":false,"split":50,"winner":null,"variants":["A","B"]}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.landing_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_settings TO authenticated;
GRANT ALL ON public.landing_settings TO service_role;
ALTER TABLE public.landing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read landing settings" ON public.landing_settings FOR SELECT USING (true);
CREATE POLICY "Admins write landing settings (i)" ON public.landing_settings
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins write landing settings (u)" ON public.landing_settings
  FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

INSERT INTO public.landing_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
