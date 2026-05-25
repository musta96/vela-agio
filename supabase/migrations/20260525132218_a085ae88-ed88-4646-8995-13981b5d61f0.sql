
create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default true,
  label text not null,
  description text,
  category text not null default 'general',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.feature_flags enable row level security;

create policy "feature_flags public read"
  on public.feature_flags for select
  using (true);

create policy "Admins insert feature flags"
  on public.feature_flags for insert to authenticated
  with check (has_role(auth.uid(), 'admin'));

create policy "Admins update feature flags"
  on public.feature_flags for update to authenticated
  using (has_role(auth.uid(), 'admin'))
  with check (has_role(auth.uid(), 'admin'));

create policy "Admins delete feature flags"
  on public.feature_flags for delete to authenticated
  using (has_role(auth.uid(), 'admin'));

create trigger feature_flags_set_updated_at
  before update on public.feature_flags
  for each row execute function public.set_updated_at();

insert into public.feature_flags (key, enabled, label, description, category) values
  ('pricing', false, 'Pricing page & paid tiers', 'Show the Pricing page and paid plan gating. Off = everything free for everyone.', 'monetization'),
  ('paywall', false, 'Enforce paywall', 'Restrict Pro/Advisor features to paying users.', 'monetization'),
  ('api_docs', true, 'API & Developer docs', 'Public /api documentation page.', 'monetization'),
  ('copilot', true, 'AI Copilot', 'Conversational AI assistant.', 'ai'),
  ('research_report', true, 'AI Research reports', 'AI-generated long-form research.', 'ai'),
  ('news_sentiment', true, 'News sentiment AI', 'AI sentiment classification on news.', 'ai'),
  ('portfolio_doctor', true, 'Portfolio Doctor AI', 'AI portfolio review.', 'ai'),
  ('intraday', true, 'Intraday & L2 book', 'Minute bars, VWAP/TWAP, order book.', 'data'),
  ('corporate_actions', true, 'Corporate actions', 'Splits, dividends, M&A.', 'data'),
  ('filings', true, 'Filings (EDGAR/Consob)', 'Regulatory filings ingestion.', 'data'),
  ('earnings', true, 'Earnings calendar', 'Upcoming earnings + surprises.', 'data'),
  ('insider', true, 'Insider transactions', 'Form 4 / insider trades.', 'data'),
  ('macro', true, 'Macro dashboard', 'Rates, inflation, FX, commodities.', 'data'),
  ('optimizer', true, 'Portfolio optimizer', 'MVO / Risk Parity / HRP.', 'portfolio'),
  ('rebalance', true, 'Rebalance engine', 'Drift-band rebalancing.', 'portfolio'),
  ('blotter', true, 'Paper trading blotter', 'Paper orders + P&L.', 'portfolio'),
  ('tax_harvest', true, 'Tax-loss harvesting', 'Harvest opportunities.', 'portfolio'),
  ('goals', true, 'Goal planner', 'Retirement / savings goals.', 'portfolio'),
  ('screener', true, 'NL Screener', 'Natural-language stock screener.', 'research'),
  ('baskets', true, 'Thematic baskets', 'Curated thematic baskets.', 'research'),
  ('peers', true, 'Peers analysis', 'Automated peer benchmarking.', 'research'),
  ('quant', true, 'Quant alpha scores', 'Value/Quality/Momentum/LowVol.', 'research'),
  ('event_study', true, 'Event study', 'Event-driven backtests.', 'research'),
  ('notes', true, 'Research notes', 'Personal research notes.', 'research'),
  ('education', true, 'Education & learning', 'Learning hub.', 'consumer'),
  ('onboarding', true, 'Onboarding wizard', 'Risk-profile onboarding.', 'consumer'),
  ('suitability', true, 'MiFID II suitability', 'Suitability questionnaire.', 'consumer'),
  ('italian_language', true, 'Italian language', 'Allow switching UI to Italian.', 'platform'),
  ('alerts', true, 'Alerts engine', 'Custom alert rules + notifications.', 'platform')
on conflict (key) do nothing;
