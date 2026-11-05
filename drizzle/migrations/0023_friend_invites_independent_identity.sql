ALTER TABLE public.friend_invites DROP CONSTRAINT friend_invites_user_id_fkey;
CREATE OR REPLACE FUNCTION public.friend_signup_lifecycle() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE receipt text;
BEGIN
  IF TG_OP='DELETE' THEN
    DELETE FROM public.friend_invite_signups WHERE user_id=OLD.id;
    DELETE FROM public.friend_invites WHERE user_id=OLD.id;
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