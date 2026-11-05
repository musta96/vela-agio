BEGIN;
DO $$
DECLARE owner_id uuid:=gen_random_uuid(); friend_id uuid:=gen_random_uuid(); old_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); code text; receipt uuid; second uuid; stats jsonb;
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data,created_at,updated_at) VALUES
    (owner_id,'referral-owner-'||owner_id||'@example.invalid','{}',now()-interval '1 day',now()),
    (old_id,'referral-old-'||old_id||'@example.invalid','{}',now()-interval '60 days',now()),
    (other_id,'referral-other-'||other_id||'@example.invalid','{}',now()-interval '1 day',now());
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  stats:=public.my_friend_invite(); code:=stats->>'token';
  IF length(code)<>32 THEN RAISE EXCEPTION 'invalid personal token'; END IF;
  IF public.record_friend_invite_visit(code,gen_random_uuid()) IS NOT NULL THEN RAISE EXCEPTION 'self visit counted'; END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);
  second:=gen_random_uuid(); receipt:=public.record_friend_invite_visit(code,second);
  IF public.record_friend_invite_visit(code,second)<>receipt THEN RAISE EXCEPTION 'repeat visit not deduplicated'; END IF;
  INSERT INTO auth.users(id,email,raw_user_meta_data,created_at,updated_at) VALUES
    (friend_id,'referral-friend-'||friend_id||'@example.invalid',jsonb_build_object('friend_invite_visit',receipt::text),clock_timestamp(),now());
  IF NOT EXISTS(SELECT 1 FROM public.friend_invite_signups WHERE user_id=friend_id AND visit_id=receipt AND confirmed_at IS NULL) THEN RAISE EXCEPTION 'signup not attributed by auth trigger'; END IF;
  UPDATE auth.users SET email_confirmed_at=now() WHERE id=friend_id;
  IF NOT EXISTS(SELECT 1 FROM public.friend_invite_signups WHERE user_id=friend_id AND confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'confirmation not tracked'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  stats:=public.my_friend_invite();
  IF (stats->>'visits')::int<>1 OR (stats->>'signups')::int<>1 OR (stats->>'confirmed')::int<>1 THEN RAISE EXCEPTION 'wrong aggregate stats: %',stats; END IF;
  PERFORM set_config('request.jwt.claim.sub',other_id::text,true);
  stats:=public.my_friend_invite(); IF (stats->>'visits')::int<>0 THEN RAISE EXCEPTION 'another owner saw results'; END IF;
  PERFORM set_config('request.jwt.claim.sub',old_id::text,true);
  IF public.claim_friend_invite(receipt) THEN RAISE EXCEPTION 'existing account attributed'; END IF;
  IF has_function_privilege('anon','public.my_friend_invite()','execute') THEN RAISE EXCEPTION 'anonymous aggregate access'; END IF;
  IF has_function_privilege('authenticated','public.attribute_friend_signup(uuid,uuid,timestamptz,timestamptz)','execute') THEN RAISE EXCEPTION 'client can forge attribution'; END IF;
  IF has_table_privilege('authenticated','public.friend_invite_signups','select') THEN RAISE EXCEPTION 'client can read identity rows'; END IF;
  DELETE FROM auth.users WHERE id=friend_id;
  IF EXISTS(SELECT 1 FROM public.friend_invite_signups WHERE user_id=friend_id) THEN RAISE EXCEPTION 'erasure left attribution'; END IF;
END $$;
ROLLBACK;