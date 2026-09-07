CREATE OR REPLACE FUNCTION public.protect_profile_entitlements()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
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
     OR NEW.recommendation_verdicts_override IS DISTINCT FROM OLD.recommendation_verdicts_override
  THEN
    RAISE EXCEPTION 'Billing and advice-gating fields can only be changed by an administrator'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;