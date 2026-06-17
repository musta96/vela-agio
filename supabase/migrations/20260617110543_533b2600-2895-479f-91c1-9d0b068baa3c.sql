
-- Landing sections: restrict public reads to enabled rows; admins keep full read via ALL/manage policies
DROP POLICY IF EXISTS "Anyone can read enabled landing sections" ON public.landing_sections;
CREATE POLICY "Anyone can read enabled landing sections"
ON public.landing_sections
FOR SELECT
USING (enabled = true OR has_role(auth.uid(), 'admin'::app_role));

-- AI event log: disallow NULL user_id inserts from clients
DROP POLICY IF EXISTS "Users insert own events" ON public.ai_event_log;
CREATE POLICY "Users insert own events"
ON public.ai_event_log
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Storage: drop overly broad public listing policy on avatars (public URLs continue to work)
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
