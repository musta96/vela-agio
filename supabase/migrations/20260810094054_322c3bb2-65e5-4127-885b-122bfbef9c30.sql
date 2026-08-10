-- Restrict client updates on advisory_consents to revocation only.
DROP POLICY IF EXISTS "Clients revoke own consent" ON public.advisory_consents;

CREATE POLICY "Clients revoke own consent"
ON public.advisory_consents
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND revoked_at IS NULL)
WITH CHECK (auth.uid() = user_id AND revoked_at IS NOT NULL);

-- Column-level immutability: only revoked_at may change on a client update.
CREATE OR REPLACE FUNCTION public.advisory_consents_revoke_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.granted_to IS DISTINCT FROM OLD.granted_to
     OR NEW.scope IS DISTINCT FROM OLD.scope
     OR NEW.client_role IS DISTINCT FROM OLD.client_role
     OR NEW.mandate_ref IS DISTINCT FROM OLD.mandate_ref
     OR NEW.granted_at IS DISTINCT FROM OLD.granted_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.note IS DISTINCT FROM OLD.note
  THEN
    RAISE EXCEPTION 'Only revoked_at may be changed on advisory_consents';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS advisory_consents_revoke_only_trg ON public.advisory_consents;
CREATE TRIGGER advisory_consents_revoke_only_trg
BEFORE UPDATE ON public.advisory_consents
FOR EACH ROW
WHEN (current_setting('role', true) IS DISTINCT FROM 'service_role')
EXECUTE FUNCTION public.advisory_consents_revoke_only();