-- 1. Research notes (synced across devices)
CREATE TABLE IF NOT EXISTS public.research_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_notes TO authenticated;
GRANT ALL ON public.research_notes TO service_role;

ALTER TABLE public.research_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own research notes"
  ON public.research_notes FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS research_notes_user_created_idx
  ON public.research_notes (user_id, created_at DESC);

CREATE TRIGGER research_notes_set_updated_at
  BEFORE UPDATE ON public.research_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Paper blotter trades (synced across devices)
CREATE TABLE IF NOT EXISTS public.blotter_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  note TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT blotter_trades_side_chk CHECK (side IN ('BUY','SELL')),
  CONSTRAINT blotter_trades_qty_chk CHECK (quantity > 0),
  CONSTRAINT blotter_trades_price_chk CHECK (price > 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blotter_trades TO authenticated;
GRANT ALL ON public.blotter_trades TO service_role;

ALTER TABLE public.blotter_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own blotter trades"
  ON public.blotter_trades FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS blotter_trades_user_executed_idx
  ON public.blotter_trades (user_id, executed_at DESC);

-- 3. Lock billing / entitlement columns on profiles to admins + service role
CREATE OR REPLACE FUNCTION public.protect_profile_entitlements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  -- service_role (edge functions, Stripe webhooks) and admins may change anything.
  IF v_role = 'service_role' OR auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
     OR NEW.current_period_end IS DISTINCT FROM OLD.current_period_end
     OR NEW.cancel_at_period_end IS DISTINCT FROM OLD.cancel_at_period_end
     OR NEW.past_due_since IS DISTINCT FROM OLD.past_due_since
     OR NEW.retention_offer_applied_at IS DISTINCT FROM OLD.retention_offer_applied_at
     OR NEW.unrestricted_advice IS DISTINCT FROM OLD.unrestricted_advice
     OR NEW.allow_cross_asset IS DISTINCT FROM OLD.allow_cross_asset
     OR NEW.allow_shorts IS DISTINCT FROM OLD.allow_shorts
     OR NEW.allow_derivatives IS DISTINCT FROM OLD.allow_derivatives
     OR NEW.recommendation_verdicts_override IS DISTINCT FROM OLD.recommendation_verdicts_override
  THEN
    RAISE EXCEPTION 'Billing and advice-gating fields can only be changed by an administrator'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_entitlements ON public.profiles;
CREATE TRIGGER profiles_protect_entitlements
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_entitlements();

-- 4. Lock seat_limit on enterprise_firms to admins + service role
CREATE OR REPLACE FUNCTION public.protect_firm_seat_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF v_role = 'service_role' OR auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.seat_limit IS DISTINCT FROM OLD.seat_limit
     OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
  THEN
    RAISE EXCEPTION 'Seat limit is billing-controlled and can only be changed by an administrator'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enterprise_firms_protect_seat_limit ON public.enterprise_firms;
CREATE TRIGGER enterprise_firms_protect_seat_limit
  BEFORE UPDATE ON public.enterprise_firms
  FOR EACH ROW EXECUTE FUNCTION public.protect_firm_seat_limit();