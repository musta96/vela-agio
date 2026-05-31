/**
 * Generate a short correlation ID that ties a single user action together
 * across client logs, edge function logs, and the ai_event_log table.
 * Format: <epoch36>-<random4>  e.g. "ltqz8a-9f3b"
 */
export function newCorrelationId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 6);
  return `${t}-${r}`;
}

export const CORRELATION_HEADER = "x-correlation-id";