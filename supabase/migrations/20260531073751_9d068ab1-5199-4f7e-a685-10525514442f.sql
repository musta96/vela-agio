
CREATE TABLE IF NOT EXISTS public.legal_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind text NOT NULL,                       -- 'terms' | 'privacy' | 'risk_disclosure' | 'cookies' | custom slug
  version text NOT NULL,                    -- e.g. '2026-05-31' or '1.2.0'
  title text NOT NULL,
  body text NOT NULL DEFAULT '',            -- markdown
  status text NOT NULL DEFAULT 'draft',     -- 'draft' | 'published' | 'archived'
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, version)
);

GRANT SELECT ON public.legal_documents TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_documents TO authenticated;
GRANT ALL ON public.legal_documents TO service_role;

ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_docs_public_read_published"
  ON public.legal_documents FOR SELECT
  USING (status = 'published' OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "legal_docs_admin_insert"
  ON public.legal_documents FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "legal_docs_admin_update"
  ON public.legal_documents FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "legal_docs_admin_delete"
  ON public.legal_documents FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS legal_documents_kind_status_idx
  ON public.legal_documents (kind, status, published_at DESC);

CREATE TRIGGER legal_documents_set_updated_at
  BEFORE UPDATE ON public.legal_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
