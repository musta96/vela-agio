CREATE TABLE public.friend_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.friend_invites TO authenticated;
GRANT ALL ON public.friend_invites TO service_role;
ALTER TABLE public.friend_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY friend_invites_owner_read ON public.friend_invites FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TABLE public.friend_invite_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES public.friend_invites(id) ON DELETE CASCADE,
  browser_session uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(invite_id, browser_session)
);
GRANT ALL ON public.friend_invite_visits TO service_role;
ALTER TABLE public.friend_invite_visits ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.friend_invite_signups (
  user_id uuid PRIMARY KEY,
  visit_id uuid NOT NULL UNIQUE REFERENCES public.friend_invite_visits(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);
GRANT ALL ON public.friend_invite_signups TO service_role;
ALTER TABLE public.friend_invite_signups ENABLE ROW LEVEL SECURITY;
CREATE INDEX friend_invite_visits_invite_created ON public.friend_invite_visits(invite_id, created_at);
CREATE FUNCTION public.my_friend_invite() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE invite public.friend_invites; visits bigint; signups bigint; confirmed bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  INSERT INTO public.friend_invites(user_id) VALUES (auth.uid()) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO invite FROM public.friend_invites WHERE user_id=auth.uid();
  SELECT count(*), count(s.user_id), count(s.confirmed_at) INTO visits, signups, confirmed
    FROM public.friend_invite_visits v LEFT JOIN public.friend_invite_signups s ON s.visit_id=v.id WHERE v.invite_id=invite.id;
  RETURN jsonb_build_object('token', invite.token, 'visits', visits, 'signups', signups, 'confirmed', confirmed);
END $$;
REVOKE ALL ON FUNCTION public.my_friend_invite() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_friend_invite() TO authenticated, service_role;
CREATE FUNCTION public.record_friend_invite_visit(_token text, _browser_session uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE invite public.friend_invites; receipt uuid;
BEGIN
  IF _token IS NULL OR _token !~ '^[a-f0-9]{32}$' OR _browser_session IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO invite FROM public.friend_invites WHERE token=_token;
  IF invite.id IS NULL OR invite.user_id=auth.uid() THEN RETURN NULL; END IF;
  INSERT INTO public.friend_invite_visits(invite_id,browser_session) VALUES(invite.id,_browser_session)
    ON CONFLICT(invite_id,browser_session) DO UPDATE SET browser_session=EXCLUDED.browser_session RETURNING id INTO receipt;
  RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.record_friend_invite_visit(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_friend_invite_visit(text,uuid) TO anon, authenticated, service_role;
CREATE FUNCTION public.attribute_friend_signup(_user_id uuid, _visit_id uuid, _created_at timestamptz, _confirmed_at timestamptz) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE eligible uuid;
BEGIN
  SELECT v.id INTO eligible FROM public.friend_invite_visits v JOIN public.friend_invites i ON i.id=v.invite_id
  WHERE v.id=_visit_id AND i.user_id<>_user_id AND v.created_at<=_created_at AND v.created_at>=_created_at-interval '30 days';
  IF eligible IS NULL THEN RETURN false; END IF;
  INSERT INTO public.friend_invite_signups(user_id,visit_id,created_at,confirmed_at) VALUES(_user_id,eligible,_created_at,_confirmed_at)
    ON CONFLICT DO NOTHING;
  RETURN EXISTS(SELECT 1 FROM public.friend_invite_signups WHERE user_id=_user_id AND visit_id=eligible);
END $$;
REVOKE ALL ON FUNCTION public.attribute_friend_signup(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attribute_friend_signup(uuid,uuid,timestamptz,timestamptz) TO service_role;
CREATE FUNCTION public.claim_friend_invite(_visit_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT id,created_at,email_confirmed_at INTO u FROM auth.users WHERE id=auth.uid();
  IF u.created_at < now()-interval '30 days' THEN RETURN false; END IF;
  RETURN public.attribute_friend_signup(u.id,_visit_id,u.created_at,u.email_confirmed_at);
END $$;
REVOKE ALL ON FUNCTION public.claim_friend_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_friend_invite(uuid) TO authenticated, service_role;
CREATE FUNCTION public.friend_signup_lifecycle() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE receipt text;
BEGIN
  IF TG_OP='DELETE' THEN
    DELETE FROM public.friend_invite_signups WHERE user_id=OLD.id;
    RETURN OLD;
  END IF;
  IF TG_OP='INSERT' THEN
    receipt := NEW.raw_user_meta_data->>'friend_invite_visit';
    IF receipt ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN
      PERFORM public.attribute_friend_signup(NEW.id,receipt::uuid,NEW.created_at,NEW.email_confirmed_at);
    END IF;
  ELSE
    UPDATE public.friend_invite_signups SET confirmed_at=NEW.email_confirmed_at WHERE user_id=NEW.id AND confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.friend_signup_lifecycle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.friend_signup_lifecycle() TO service_role;
CREATE TRIGGER friend_signup_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.friend_signup_lifecycle();
CREATE TRIGGER friend_signup_confirmed AFTER UPDATE OF email_confirmed_at ON auth.users FOR EACH ROW EXECUTE FUNCTION public.friend_signup_lifecycle();
CREATE TRIGGER friend_signup_deleted AFTER DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.friend_signup_lifecycle();