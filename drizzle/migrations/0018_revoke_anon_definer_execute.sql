REVOKE EXECUTE ON FUNCTION public.has_feature(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_pro_access(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_firm_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_firm_owner(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_entitlements() FROM anon;