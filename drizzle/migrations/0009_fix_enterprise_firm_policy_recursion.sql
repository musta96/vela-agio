-- enterprise_firms and enterprise_memberships policies referenced each other,
-- producing "infinite recursion detected in policy" for every firm read/write.
-- Break the cycle with security-definer helpers (the standard RLS pattern).

CREATE OR REPLACE FUNCTION public.is_firm_owner(_firm_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enterprise_firms f
    WHERE f.id = _firm_id AND f.owner_user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_firm_member(_firm_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enterprise_memberships m
    WHERE m.firm_id = _firm_id AND m.user_id = _user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_firm_owner(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_firm_member(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Firm members can view their firm" ON public.enterprise_firms;
CREATE POLICY "Firm members can view their firm"
  ON public.enterprise_firms FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR public.is_firm_member(id, auth.uid()));

DROP POLICY IF EXISTS "Firm members can view memberships" ON public.enterprise_memberships;
CREATE POLICY "Firm members can view memberships"
  ON public.enterprise_memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_firm_owner(firm_id, auth.uid()));

DROP POLICY IF EXISTS "Firm owners can manage memberships" ON public.enterprise_memberships;
CREATE POLICY "Firm owners can manage memberships"
  ON public.enterprise_memberships FOR ALL TO authenticated
  USING (public.is_firm_owner(firm_id, auth.uid()))
  WITH CHECK (public.is_firm_owner(firm_id, auth.uid()));