ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_provider TEXT NOT NULL DEFAULT 'lovable',
  ADD COLUMN IF NOT EXISTS ai_model TEXT;

-- Allow only known providers
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_ai_provider_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_ai_provider_check
  CHECK (ai_provider IN ('lovable','openai','groq','mistral','perplexity','anthropic','gemini'));