INSERT INTO public.support_tickets (
  user_id, category, severity, source, subject, message, status, created_at, updated_at
)
SELECT
  fr.user_id,
  'feature',
  CASE
    WHEN (fr.ai_analysis->>'priority') IN ('must_have','critical') THEN 'high'
    WHEN (fr.ai_analysis->>'priority') = 'nice_to_have' THEN 'low'
    ELSE 'normal'
  END,
  'chat',
  COALESCE(NULLIF(fr.title, ''), 'Feature request from Copilot'),
  concat_ws(E'\n',
    CASE WHEN fr.user_quote IS NOT NULL AND fr.user_quote <> '' THEN 'User said: ' || fr.user_quote END,
    CASE WHEN fr.ai_analysis->>'why_it_matters' IS NOT NULL THEN 'Why it matters: ' || (fr.ai_analysis->>'why_it_matters') END,
    CASE WHEN fr.ai_analysis->>'proposed_implementation' IS NOT NULL THEN 'Proposed implementation: ' || (fr.ai_analysis->>'proposed_implementation') END,
    CASE WHEN fr.ai_analysis->>'effort' IS NOT NULL THEN 'Effort: ' || (fr.ai_analysis->>'effort') END,
    CASE WHEN fr.ai_analysis->>'priority' IS NOT NULL THEN 'Priority: ' || (fr.ai_analysis->>'priority') END
  ),
  'open',
  fr.created_at,
  fr.created_at
FROM public.feature_requests fr
WHERE NOT EXISTS (
  SELECT 1 FROM public.support_tickets st
  WHERE st.user_id = fr.user_id
    AND st.category = 'feature'
    AND st.source = 'chat'
    AND st.subject = COALESCE(NULLIF(fr.title, ''), 'Feature request from Copilot')
    AND st.created_at = fr.created_at
);