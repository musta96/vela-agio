DROP POLICY IF EXISTS "Anyone can submit an enterprise lead" ON public.enterprise_leads;
CREATE POLICY "Anyone can submit an enterprise lead"
ON public.enterprise_leads
FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(first_name) >= 1 AND length(first_name) <= 100
  AND length(last_name) >= 1 AND length(last_name) <= 100
  AND length(email) >= 3 AND length(email) <= 255
  AND length(role) >= 1 AND length(role) <= 120
  AND (company IS NULL OR length(company) <= 200)
  AND (firm_name IS NULL OR length(firm_name) <= 200)
  AND (message IS NULL OR length(message) <= 2000)
  AND (num_clients IS NULL OR (num_clients >= 0 AND num_clients <= 1000000))
  AND (user_id IS NULL OR user_id = auth.uid())
);