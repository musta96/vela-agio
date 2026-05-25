
insert into public.feature_flags (key, enabled, label, description, category) values
  ('advisor', true, 'AI Advisor (sell signals & portfolio improvements)', 'Personalized sell/trim suggestions and portfolio improvement ideas based on holdings, goals, news, regulation and weather signals.', 'consumer')
on conflict (key) do nothing;
