REVOKE EXECUTE ON FUNCTION public.has_advisory_consent(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_advisory_consent(uuid, uuid, text) TO authenticated, service_role;