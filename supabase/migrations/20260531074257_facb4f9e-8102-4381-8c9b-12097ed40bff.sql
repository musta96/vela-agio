CREATE TABLE IF NOT EXISTS public.landing_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  kind text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.landing_sections TO anon, authenticated;
GRANT ALL ON public.landing_sections TO service_role;

ALTER TABLE public.landing_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read enabled landing sections"
  ON public.landing_sections FOR SELECT
  USING (true);

CREATE POLICY "Admins manage landing sections — insert"
  ON public.landing_sections FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage landing sections — update"
  ON public.landing_sections FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage landing sections — delete"
  ON public.landing_sections FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER landing_sections_set_updated_at
  BEFORE UPDATE ON public.landing_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_landing_sections_sort ON public.landing_sections(sort_order);