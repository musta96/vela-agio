
-- Extend app_role enum with sub-roles (idempotent)
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'compliance';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'engineer';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Auto-expiry on kill switches
ALTER TABLE public.platform_controls
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- GDPR erasure pipeline with grace period
CREATE TABLE IF NOT EXISTS public.gdpr_erasure_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_email TEXT,
  requested_by UUID,
  requested_by_email TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | cancelled | completed
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  completed_at TIMESTAMPTZ,
  certificate_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.gdpr_erasure_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage erasure" ON public.gdpr_erasure_requests;
CREATE POLICY "Admins manage erasure" ON public.gdpr_erasure_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Users see own erasure" ON public.gdpr_erasure_requests;
CREATE POLICY "Users see own erasure" ON public.gdpr_erasure_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Impersonation / break-glass sessions
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL,
  actor_email TEXT,
  target_user_id UUID,
  target_email TEXT,
  purpose TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 minutes'),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read sessions" ON public.admin_sessions;
CREATE POLICY "Admins read sessions" ON public.admin_sessions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Health checks snapshot
CREATE TABLE IF NOT EXISTS public.health_checks (
  service TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'unknown', -- ok | degraded | down | unknown
  latency_ms INTEGER,
  detail TEXT,
  last_checked TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.health_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read health" ON public.health_checks;
CREATE POLICY "Admins read health" ON public.health_checks
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_erasure_status ON public.gdpr_erasure_requests(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_actor ON public.admin_sessions(actor_id, created_at DESC);
