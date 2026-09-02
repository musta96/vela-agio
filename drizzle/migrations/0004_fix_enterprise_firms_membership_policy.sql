DROP POLICY IF EXISTS "Firm members can view their firm" ON public.enterprise_firms;
CREATE POLICY "Firm members can view their firm"
ON public.enterprise_firms
FOR SELECT
TO authenticated
USING (
  owner_user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.enterprise_memberships AS m
    WHERE m.firm_id = enterprise_firms.id
      AND m.user_id = auth.uid()
  )
);