CREATE TABLE public.enterprise_firms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'My advisory firm',
  seat_limit integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enterprise_firms TO authenticated;
GRANT ALL ON public.enterprise_firms TO service_role;

CREATE TABLE public.enterprise_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.enterprise_firms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'advisor',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enterprise_memberships TO authenticated;
GRANT ALL ON public.enterprise_memberships TO service_role;

CREATE TABLE public.enterprise_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.enterprise_firms(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'advisor',
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  invited_by uuid NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enterprise_invitations TO authenticated;
GRANT ALL ON public.enterprise_invitations TO service_role;

ALTER TABLE public.enterprise_firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enterprise owners can manage their firm" ON public.enterprise_firms FOR ALL TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "Firm members can view their firm" ON public.enterprise_firms FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.enterprise_memberships m WHERE m.firm_id = id AND m.user_id = auth.uid()));
CREATE POLICY "Firm members can view memberships" ON public.enterprise_memberships FOR SELECT TO authenticated USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.enterprise_firms f WHERE f.id = firm_id AND f.owner_user_id = auth.uid()));
CREATE POLICY "Firm owners can manage memberships" ON public.enterprise_memberships FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.enterprise_firms f WHERE f.id = firm_id AND f.owner_user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.enterprise_firms f WHERE f.id = firm_id AND f.owner_user_id = auth.uid()));
CREATE POLICY "Firm owners can manage invitations" ON public.enterprise_invitations FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.enterprise_firms f WHERE f.id = firm_id AND f.owner_user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.enterprise_firms f WHERE f.id = firm_id AND f.owner_user_id = auth.uid()));

CREATE TRIGGER enterprise_firms_set_updated_at BEFORE UPDATE ON public.enterprise_firms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();