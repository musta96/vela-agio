-- Anonymous visitors have no auth.uid(), so these user-scoped SECURITY DEFINER
-- helpers must not be callable without signing in. has_role stays granted to anon
-- because public RLS policies (legal_documents, landing_sections, subscription_plans)
-- evaluate it for logged-out reads.
REVOKE EXECUTE ON FUNCTION public.has_feature(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_pro_access(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_firm_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_firm_owner(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_entitlements() FROM anon;