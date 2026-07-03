/**
 * Redaction helpers used in locked-preview surfaces. Free users see the real
 * structure of the report (labels, section titles, first paragraph) but every
 * quantitative value is replaced by an obvious placeholder like `XX.XX%` so
 * they cannot back out the Pro-only computation.
 *
 * Rules:
 *  - Percentages → `XX.XX%`
 *  - Currency    → `$XXX,XXX` / `€XXX,XXX`
 *  - Bare numbers with 2+ digits → `XX.XX` (preserves sign & currency prefix if present)
 *  - Short numbers (1 digit, dates, years) → left alone so copy still reads naturally.
 */
export function redactNumbers(input: string): string {
  if (!input) return input;
  let out = input;
  // Percentages first (so we don't double-replace the number).
  out = out.replace(/-?\d+(?:[.,]\d+)?\s?%/g, "XX.XX%");
  // Currency amounts: symbol + digits (optionally decimals, thousands separators).
  out = out.replace(/([€$£¥])\s?-?\d[\d.,]*/g, "$1XXX,XXX");
  // Bare numbers with ≥ 2 integer digits — skip 4-digit years (1900-2099).
  out = out.replace(/(^|[^0-9A-Za-z])(-?)(\d{2,})(?:[.,]\d+)?/g, (m, pre, sign, intPart) => {
    if (/^(19|20)\d{2}$/.test(intPart)) return m; // year
    return `${pre}${sign}XX.XX`;
  });
  return out;
}

/** Convenience for redacting a single numeric value (returns a display string). */
export function redactValue(kind: "percent" | "currency" | "number", currency = "€"): string {
  if (kind === "percent") return "XX.XX%";
  if (kind === "currency") return `${currency}XXX,XXX`;
  return "XX.XX";
}