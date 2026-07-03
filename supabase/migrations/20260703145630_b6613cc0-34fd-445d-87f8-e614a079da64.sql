
CREATE TABLE IF NOT EXISTS public.cancellation_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id text,
  reason text,
  feedback text,
  accepted_offer boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.cancellation_feedback TO authenticated;
GRANT ALL ON public.cancellation_feedback TO service_role;

ALTER TABLE public.cancellation_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own cancellation feedback" ON public.cancellation_feedback;
CREATE POLICY "Users insert own cancellation feedback"
  ON public.cancellation_feedback FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own cancellation feedback" ON public.cancellation_feedback;
CREATE POLICY "Users view own cancellation feedback"
  ON public.cancellation_feedback FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_cancellation_feedback_user ON public.cancellation_feedback(user_id, created_at DESC);

-- Public-safe read of the retention offer for the cancellation flow.
CREATE OR REPLACE FUNCTION public.get_retention_offer()
RETURNS TABLE(
  enabled boolean,
  discount_type text,
  discount_value numeric,
  duration_months integer,
  copy text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT retention_offer_enabled,
         retention_discount_type::text,
         retention_discount_value,
         retention_duration_months,
         retention_offer_copy
  FROM public.billing_settings
  WHERE id = 1
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_retention_offer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_retention_offer() TO anon, authenticated;
