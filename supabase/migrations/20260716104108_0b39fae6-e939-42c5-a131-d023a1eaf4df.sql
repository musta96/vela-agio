
CREATE TABLE public.mcp_call_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  ok BOOLEAN NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  client_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcp_call_log_user_tool_time
  ON public.mcp_call_log (user_id, tool_name, created_at DESC);
CREATE INDEX idx_mcp_call_log_created_at
  ON public.mcp_call_log (created_at DESC);

GRANT SELECT, INSERT ON public.mcp_call_log TO authenticated;
GRANT INSERT ON public.mcp_call_log TO anon;
GRANT ALL ON public.mcp_call_log TO service_role;

ALTER TABLE public.mcp_call_log ENABLE ROW LEVEL SECURITY;

-- Anyone (auth or anon) may insert a log entry, but only for their own user_id
-- (or NULL when unauthenticated). This prevents spoofing another user's row.
CREATE POLICY "Users insert own MCP call log entries"
  ON public.mcp_call_log
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (
    (user_id IS NULL AND auth.uid() IS NULL)
    OR user_id = auth.uid()
  );

-- Users can read their own log; admins can read all.
CREATE POLICY "Users read own MCP call log"
  ON public.mcp_call_log
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
