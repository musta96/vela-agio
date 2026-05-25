
-- has_role: only callable by the server (service_role) — RLS policies that use it still work
revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
grant execute on function public.has_role(uuid, public.app_role) to service_role;

-- handle_new_user: only the auth trigger runs it; nobody else needs it
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- set_updated_at: trigger-only
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- Explicit deny policy for the vault (defense in depth; revokes already prevent access)
drop policy if exists "Vault server only" on public.user_api_keys;
create policy "Vault server only" on public.user_api_keys
  for all to authenticated using (false) with check (false);
