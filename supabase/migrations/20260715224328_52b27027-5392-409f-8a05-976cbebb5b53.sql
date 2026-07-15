
CREATE TABLE public.ai_research_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  name text,
  mode text NOT NULL,
  source_hash text NOT NULL,
  source_url text,
  source_label text,
  focus text,
  report jsonb NOT NULL,
  model text,
  provider_notice text,
  source_note text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_research_notes TO authenticated;
GRANT ALL ON public.ai_research_notes TO service_role;

ALTER TABLE public.ai_research_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own research notes"
  ON public.ai_research_notes FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "users insert own research notes"
  ON public.ai_research_notes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own research notes"
  ON public.ai_research_notes FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own research notes"
  ON public.ai_research_notes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_ai_research_notes_user_symbol ON public.ai_research_notes(user_id, symbol, generated_at DESC);
CREATE UNIQUE INDEX idx_ai_research_notes_user_hash ON public.ai_research_notes(user_id, source_hash);
