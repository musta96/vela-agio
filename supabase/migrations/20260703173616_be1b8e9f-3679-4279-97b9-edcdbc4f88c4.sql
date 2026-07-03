
ALTER TABLE public.enterprise_leads
  ADD COLUMN IF NOT EXISTS num_clients integer,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS firm_name text;

-- Widen anonymous insert policy to permit optional num_clients & firm_name.
DROP POLICY IF EXISTS "Anyone can submit an enterprise lead" ON public.enterprise_leads;
CREATE POLICY "Anyone can submit an enterprise lead"
  ON public.enterprise_leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(first_name) BETWEEN 1 AND 100
    AND length(last_name) BETWEEN 1 AND 100
    AND length(email) BETWEEN 3 AND 255
    AND length(role) BETWEEN 1 AND 120
    AND (company IS NULL OR length(company) <= 200)
    AND (firm_name IS NULL OR length(firm_name) <= 200)
    AND (message IS NULL OR length(message) <= 2000)
    AND (num_clients IS NULL OR (num_clients >= 0 AND num_clients <= 1000000))
  );

-- Allow admins to update internal_notes/status via existing update policy (already present).

-- RPC: count of new leads (used for the sidebar badge without exposing rows to non-admins).
CREATE OR REPLACE FUNCTION public.admin_new_enterprise_leads_count()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT COUNT(*)::int FROM public.enterprise_leads
    WHERE status = 'new'
      AND public.has_role(auth.uid(), 'admin'::app_role)
  ), 0);
$$;

GRANT EXECUTE ON FUNCTION public.admin_new_enterprise_leads_count() TO authenticated;
