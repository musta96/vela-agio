
-- Extend cancellation_feedback into a retention audit trail
ALTER TABLE public.cancellation_feedback
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'cancellation',
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Backfill: existing rows with accepted_offer=true become the accept event
UPDATE public.cancellation_feedback
   SET event_type = 'retention_offer_accepted'
 WHERE event_type = 'cancellation' AND accepted_offer = true;

CREATE INDEX IF NOT EXISTS idx_cancellation_feedback_event
  ON public.cancellation_feedback (event_type, created_at DESC);

-- Admin-facing aggregate for the owner dashboard
CREATE OR REPLACE FUNCTION public.admin_retention_audit(_since timestamptz DEFAULT (now() - interval '30 days'))
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shown int; v_accepted int; v_declined int;
  v_cancellations int; v_downgraded int;
  v_by_reason jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COUNT(*) INTO v_shown       FROM public.cancellation_feedback WHERE created_at >= _since AND event_type = 'retention_offer_shown';
  SELECT COUNT(*) INTO v_accepted    FROM public.cancellation_feedback WHERE created_at >= _since AND event_type = 'retention_offer_accepted';
  SELECT COUNT(*) INTO v_declined    FROM public.cancellation_feedback WHERE created_at >= _since AND event_type = 'retention_offer_declined';
  SELECT COUNT(*) INTO v_cancellations FROM public.cancellation_feedback WHERE created_at >= _since AND event_type = 'cancellation';
  SELECT COUNT(*) INTO v_downgraded  FROM public.cancellation_feedback WHERE created_at >= _since AND event_type = 'plan_downgraded';

  SELECT COALESCE(jsonb_agg(jsonb_build_object('reason', reason, 'count', c) ORDER BY c DESC), '[]'::jsonb)
    INTO v_by_reason
  FROM (
    SELECT COALESCE(reason, 'unspecified') AS reason, COUNT(*)::int AS c
      FROM public.cancellation_feedback
     WHERE created_at >= _since AND event_type = 'cancellation'
     GROUP BY 1
  ) x;

  RETURN jsonb_build_object(
    'since', _since,
    'offers_shown', v_shown,
    'offers_accepted', v_accepted,
    'offers_declined', v_declined,
    'accept_rate', CASE WHEN v_shown > 0 THEN round((v_accepted::numeric / v_shown) * 100, 1) ELSE NULL END,
    'cancellations', v_cancellations,
    'auto_downgrades', v_downgraded,
    'by_reason', v_by_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_retention_events(_limit int DEFAULT 200)
RETURNS TABLE(id uuid, created_at timestamptz, user_id uuid, user_email text, event_type text, reason text, feedback text, accepted_offer boolean, metadata jsonb, stripe_subscription_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT f.id, f.created_at, f.user_id, u.email::text,
         f.event_type, f.reason, f.feedback, f.accepted_offer, f.metadata, f.stripe_subscription_id
    FROM public.cancellation_feedback f
    LEFT JOIN auth.users u ON u.id = f.user_id
   WHERE public.has_role(auth.uid(), 'admin'::app_role)
   ORDER BY f.created_at DESC
   LIMIT COALESCE(_limit, 200);
$$;
