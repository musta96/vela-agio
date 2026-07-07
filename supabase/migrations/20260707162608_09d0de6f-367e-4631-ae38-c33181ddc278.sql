
CREATE TABLE public.generated_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  base_currency text,
  storage_path text NOT NULL,
  pdf_bytes integer,
  tickers text[] NOT NULL DEFAULT '{}',
  fingerprints jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_snapshot jsonb,
  parent_id uuid REFERENCES public.generated_memos(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_memos TO authenticated;
GRANT ALL ON public.generated_memos TO service_role;

ALTER TABLE public.generated_memos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own memos"
  ON public.generated_memos FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own memos"
  ON public.generated_memos FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own memos"
  ON public.generated_memos FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own memos"
  ON public.generated_memos FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_generated_memos_user_created
  ON public.generated_memos(user_id, created_at DESC);
