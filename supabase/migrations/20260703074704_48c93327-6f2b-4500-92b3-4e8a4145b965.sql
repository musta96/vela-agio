CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.enterprise_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL,
  company text,
  team_size text,
  message text,
  source text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_agent text,
  ip inet,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.enterprise_leads TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.enterprise_leads TO authenticated;
GRANT ALL ON public.enterprise_leads TO service_role;

ALTER TABLE public.enterprise_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit an enterprise lead"
  ON public.enterprise_leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(first_name) BETWEEN 1 AND 100
    AND length(last_name) BETWEEN 1 AND 100
    AND length(email) BETWEEN 3 AND 255
    AND length(role) BETWEEN 1 AND 120
    AND (company IS NULL OR length(company) <= 200)
    AND (message IS NULL OR length(message) <= 2000)
  );

CREATE POLICY "Admins can view enterprise leads"
  ON public.enterprise_leads FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update enterprise leads"
  ON public.enterprise_leads FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete enterprise leads"
  ON public.enterprise_leads FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_enterprise_leads_updated_at
  BEFORE UPDATE ON public.enterprise_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX enterprise_leads_created_at_idx ON public.enterprise_leads (created_at DESC);
CREATE INDEX enterprise_leads_status_idx ON public.enterprise_leads (status);