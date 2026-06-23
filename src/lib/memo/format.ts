/**
 * Number / currency / percentage formatters used throughout the memo template.
 * All return `null` when the input is not finite so callers can drop the slot.
 */
export function int(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value).toLocaleString("en-US");
}

export function pct(value: number | null | undefined, dp = 1): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(dp)}%`;
}

export function pctPlain(value: number | null | undefined, dp = 1): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${value.toFixed(dp)}%`;
}

export function money(
  value: number | null | undefined,
  ccy = "EUR",
  dp = 0,
): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const body = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
  const sign = value < 0 ? "-" : "";
  return `${ccy} ${sign}${body}`;
}

/** Sentence case: first letter capitalised, rest preserved (acronyms intact). */
export function sentenceCase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

/** Escape for inclusion in HTML text nodes / attribute values. */
export function esc(input: string | number | null | undefined): string {
  if (input == null) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}