ALTER TABLE public.ai_research_notes
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS ai_research_notes_tags_idx ON public.ai_research_notes USING GIN (tags);