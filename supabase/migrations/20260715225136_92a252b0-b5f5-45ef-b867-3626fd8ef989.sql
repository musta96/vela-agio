ALTER TABLE public.ai_research_notes
  ADD COLUMN IF NOT EXISTS share_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS share_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS share_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS share_created_at timestamptz;

CREATE INDEX IF NOT EXISTS ai_research_notes_share_token_idx
  ON public.ai_research_notes (share_token)
  WHERE share_token IS NOT NULL;