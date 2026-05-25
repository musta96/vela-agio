create table if not exists public.market_data_cache (
  id bigserial primary key,
  cache_key text not null unique,
  kind text not null check (kind in ('quote','ohlc','fx')),
  symbol text not null,
  range text,
  interval text,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists market_data_cache_symbol_idx on public.market_data_cache (symbol);
create index if not exists market_data_cache_expires_idx on public.market_data_cache (expires_at);

alter table public.market_data_cache enable row level security;

create policy "Authenticated users read cache"
  on public.market_data_cache for select
  to authenticated
  using (true);

create policy "No client writes"
  on public.market_data_cache for all
  to authenticated
  using (false)
  with check (false);