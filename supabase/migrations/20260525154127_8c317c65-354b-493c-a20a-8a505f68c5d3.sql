
create table public.live_order_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  broker text not null check (broker in ('alpaca','ibkr')),
  symbol text not null,
  side text not null check (side in ('buy','sell')),
  qty numeric not null check (qty > 0),
  type text not null check (type in ('market','limit')),
  limit_price numeric,
  time_in_force text not null default 'day',
  status text not null default 'pending' check (status in ('pending','confirmed','rejected','executed','failed','expired')),
  result jsonb not null default '{}'::jsonb,
  rationale text,
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.live_order_intents enable row level security;
create policy "Users view own intents" on public.live_order_intents for select using (auth.uid() = user_id);
create policy "Users insert own intents" on public.live_order_intents for insert with check (auth.uid() = user_id);
create policy "Users update own intents" on public.live_order_intents for update using (auth.uid() = user_id);
create index live_order_intents_user_pending_idx on public.live_order_intents (user_id, status, created_at desc);
create trigger live_order_intents_updated_at before update on public.live_order_intents for each row execute function public.set_updated_at();

create table public.deal_flow_cache (
  id bigserial primary key,
  kind text not null check (kind in ('ma','ipo','lbo')),
  cache_key text not null unique,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.deal_flow_cache enable row level security;
create policy "Authenticated read deal flow" on public.deal_flow_cache for select to authenticated using (true);
create policy "Deny client writes (deal_flow_cache i)" on public.deal_flow_cache for insert to anon, authenticated with check (false);
create policy "Deny client writes (deal_flow_cache u)" on public.deal_flow_cache for update to anon, authenticated using (false) with check (false);
create policy "Deny client writes (deal_flow_cache d)" on public.deal_flow_cache for delete to anon, authenticated using (false);
create index deal_flow_cache_kind_idx on public.deal_flow_cache (kind, fetched_at desc);
