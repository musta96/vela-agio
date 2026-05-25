
-- =========================
-- ROLES
-- =========================
do $$ begin
  create type public.app_role as enum ('viewer','analyst','pm','admin');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

drop policy if exists "Users view own roles" on public.user_roles;
create policy "Users view own roles" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Admins view all roles" on public.user_roles;
create policy "Admins view all roles" on public.user_roles
  for select to authenticated using (public.has_role(auth.uid(),'admin'));

drop policy if exists "Admins manage roles" on public.user_roles;
create policy "Admins manage roles" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- =========================
-- PROFILES
-- =========================
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users view own profile" on public.profiles;
create policy "Users view own profile" on public.profiles
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
  for update to authenticated using (auth.uid() = user_id);

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = user_id);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create profile + default 'viewer' role on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (user_id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'viewer')
  on conflict (user_id, role) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================
-- API KEYS VAULT
-- =========================
-- ciphertext is AES-GCM encrypted server-side in the edge function.
-- The DB never sees plaintext; the key never returns to the browser.
create table if not exists public.user_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  ciphertext text not null,   -- base64
  iv text not null,           -- base64
  hint text,                  -- last 4 chars, safe to show
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.user_api_keys enable row level security;

-- Owner can list metadata (NOT ciphertext) via dedicated view; deny direct ciphertext reads from client.
revoke all on public.user_api_keys from anon, authenticated;

-- View exposing only safe metadata to the owner
create or replace view public.user_api_keys_meta
with (security_invoker = true)
as
select id, user_id, provider, hint, created_at, updated_at
from public.user_api_keys
where auth.uid() = user_id;

grant select on public.user_api_keys_meta to authenticated;

drop trigger if exists set_user_api_keys_updated_at on public.user_api_keys;
create trigger set_user_api_keys_updated_at
  before update on public.user_api_keys
  for each row execute function public.set_updated_at();

-- =========================
-- AUDIT LOG
-- =========================
create table if not exists public.audit_log (
  id bigserial primary key,
  ts timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  action text not null,
  entity text,
  entity_id text,
  payload jsonb,
  ip text,
  user_agent text
);

alter table public.audit_log enable row level security;

drop policy if exists "Admins read audit" on public.audit_log;
create policy "Admins read audit" on public.audit_log
  for select to authenticated using (public.has_role(auth.uid(),'admin'));

-- No client-side INSERT/UPDATE/DELETE policy on purpose — only the service role (edge functions) writes.
revoke insert, update, delete on public.audit_log from anon, authenticated;

create index if not exists audit_log_ts_idx on public.audit_log(ts desc);
create index if not exists audit_log_actor_idx on public.audit_log(actor_id);
create index if not exists audit_log_action_idx on public.audit_log(action);
