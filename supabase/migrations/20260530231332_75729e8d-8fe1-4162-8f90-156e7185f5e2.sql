CREATE TABLE public.advisory_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  granted_to uuid NOT NULL,
  scope text NOT NULL,
  mandate_ref text,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT advisory_consents_scope_check CHECK (scope IN ('portfolio_read','net_worth_read','full'))
);

CREATE INDEX idx_advisory_consents_user ON public.advisory_consents(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_advisory_consents_admin ON public.advisory_consents(granted_to) WHERE revoked_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.advisory_consents TO authenticated;
GRANT ALL ON public.advisory_consents TO service_role;

ALTER TABLE public.advisory_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients view own consents"
  ON public.advisory_consents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Advisors view consents granted to them"
  ON public.advisory_consents FOR SELECT
  TO authenticated
  USING (auth.uid() = granted_to);

CREATE POLICY "Clients grant own consent"
  ON public.advisory_consents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Clients revoke own consent"
  ON public.advisory_consents FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_advisory_consent(_client uuid, _admin uuid, _scope text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.advisory_consents
    WHERE user_id = _client
      AND granted_to = _admin
      AND revoked_at IS NULL
      AND (scope = _scope OR scope = 'full')
  );
$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_market text,
  ADD COLUMN IF NOT EXISTS base_currency text DEFAULT 'EUR';