
-- Customer-facing client role enum
DO $$ BEGIN
  CREATE TYPE public.client_role AS ENUM ('principal','family_view','advisor_ro','accountant','broker_ro');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Extend advisory_consents: time-boxed expiry + role + granted_by metadata
ALTER TABLE public.advisory_consents
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_role public.client_role NOT NULL DEFAULT 'advisor_ro',
  ADD COLUMN IF NOT EXISTS note text;

-- Immutable audit log for mandate grant/revoke/view/switch
CREATE TABLE IF NOT EXISTS public.mandate_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  client_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('grant','revoke','view','switch_context','export_pdf','update_scope')),
  scope text,
  client_role public.client_role,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.mandate_audit TO authenticated;
GRANT ALL ON public.mandate_audit TO service_role;
ALTER TABLE public.mandate_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Actors insert their own audit rows"
  ON public.mandate_audit FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = actor_id);
CREATE POLICY "Clients and actors view related audit rows"
  ON public.mandate_audit FOR SELECT TO authenticated
  USING (auth.uid() = actor_id OR auth.uid() = client_id);
CREATE INDEX IF NOT EXISTS idx_mandate_audit_client ON public.mandate_audit(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mandate_audit_actor ON public.mandate_audit(actor_id, created_at DESC);

-- Tenant settings: licensing + branding (one row per owning user/workspace)
CREATE TABLE IF NOT EXISTS public.tenant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE,
  tenant_name text,
  brand_logo_url text,
  brand_primary_hex text,
  licensed_professional boolean NOT NULL DEFAULT false,
  license_number text,
  license_authority text,
  data_residency text NOT NULL DEFAULT 'eu',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_settings TO authenticated;
GRANT ALL ON public.tenant_settings TO service_role;
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages own tenant settings"
  ON public.tenant_settings FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER tenant_settings_set_updated_at BEFORE UPDATE ON public.tenant_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper: is a mandate currently active (not revoked, not expired)?
CREATE OR REPLACE FUNCTION public.has_active_mandate(_client uuid, _admin uuid, _scope text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.advisory_consents
    WHERE user_id = _client
      AND granted_to = _admin
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
      AND (scope = _scope OR scope = 'full')
  );
$$;
