-- Firm profile details (all optional, additive).
ALTER TABLE public.enterprise_firms
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS enterprise_firms_set_updated_at ON public.enterprise_firms;
CREATE TRIGGER enterprise_firms_set_updated_at
  BEFORE UPDATE ON public.enterprise_firms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Hard seat cap: the edge function already checks, but the database is the
-- last line of defence against races and any future direct writer.
CREATE OR REPLACE FUNCTION public.enforce_firm_seat_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limit integer;
  _used integer;
BEGIN
  SELECT seat_limit INTO _limit FROM public.enterprise_firms WHERE id = NEW.firm_id;
  IF _limit IS NULL THEN
    RAISE EXCEPTION 'Unknown firm %', NEW.firm_id;
  END IF;

  SELECT count(*) INTO _used FROM public.enterprise_memberships
   WHERE firm_id = NEW.firm_id
     AND (TG_OP = 'INSERT' OR user_id <> OLD.user_id);

  IF _used >= _limit THEN
    RAISE EXCEPTION 'Seat limit reached for this firm (% of % seats used)', _used, _limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enterprise_memberships_seat_limit ON public.enterprise_memberships;
CREATE TRIGGER enterprise_memberships_seat_limit
  BEFORE INSERT ON public.enterprise_memberships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_firm_seat_limit();