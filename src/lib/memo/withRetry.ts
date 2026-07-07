/**
 * Minimal exponential-backoff retry wrapper for edge-function calls made
 * from the memo builder. Not general-purpose — matches the shape we need
 * for the per-ticker deep-analysis fan-out.
 */
export interface RetryOpts {
  attempts?: number;
  /** Delay before attempt N (0-based). */
  backoffMs?: number[];
  onAttempt?: (attempt: number, err?: unknown) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const backoff = opts.backoffMs ?? [400, 1500, 4000];
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) {
      const wait = backoff[Math.min(i - 1, backoff.length - 1)];
      await new Promise((r) => setTimeout(r, wait));
    }
    try {
      opts.onAttempt?.(i);
      return await fn();
    } catch (err) {
      lastErr = err;
      opts.onAttempt?.(i, err);
    }
  }
  throw lastErr;
}