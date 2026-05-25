
create table if not exists public.sentiment_history (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  score numeric not null,
  weighted_score numeric,
  tier1_score numeric,
  tier2_score numeric,
  article_count integer not null default 0,
  label text,
  created_at timestamptz not null default now()
);

create index if not exists sentiment_history_symbol_created_idx
  on public.sentiment_history (symbol, created_at desc);

alter table public.sentiment_history enable row level security;

create policy "sentiment_history public read"
  on public.sentiment_history for select
  using (true);
