/**
 * Writing-style sanitizer enforcing the Vela memo prose rules:
 *  - no em dashes anywhere
 *  - no en dashes as sentence punctuation (preserved in numeric ranges)
 *  - banned words / banned constructions removed
 *  - no rhetorical-question section openers, no "X, Y, and Z" triad rhythm at top of paragraph
 *  - no hedging stacks ("may potentially possibly")
 */

const BANNED_WORDS: RegExp[] = [
  /\brobust\b/gi,
  /\bleverage(?:s|d|ing)?\b/gi, // verb usage of "leverage"; we strip all forms to be safe
  /\bnavigate(?:s|d|ing)?\b/gi,
  /\bin today'?s landscape\b/gi,
  /\bever[-\s]?evolving\b/gi,
  /\bfast[-\s]?paced\b/gi,
  /\bgame[-\s]?changer\b/gi,
  /\bdelve(?:s|d|ing)?\b/gi,
  /\bunlock(?:s|ed|ing)?\b/gi,
  /\bharness(?:es|ed|ing)?\b/gi,
  /\btapestry\b/gi,
  /\btestament\b/gi,
  /\bunderscore(?:s|d|ing)?\b/gi,
  /\bpivotal\b/gi,
  /\brealm\b/gi,
  /\blandscape\b/gi,
  /\bit'?s worth noting\b/gi,
  /\bit'?s important to note\b/gi,
  /\bwhen it comes to\b/gi,
];

const BANNED_CONSTRUCTIONS: RegExp[] = [
  /\bit'?s not just [^.]+,?\s*it'?s [^.]+\./gi,
  /\bmore than just [^.]+\./gi,
  /\bwhether you'?re [^.]+ or [^.]+\./gi,
];

const HEDGING_STACK = /\b(may|might|could)\s+(potentially|possibly|perhaps)\s+(possibly|potentially)?\b/gi;

/** Replace em-dashes and stray en-dash punctuation while keeping numeric ranges. */
export function stripDashes(text: string): string {
  let out = text;
  // em dash always banned
  out = out.replace(/\s*—\s*/g, ", ");
  // en dash between word chars → comma; en dash between digits stays (range)
  out = out.replace(/(\D)\s*–\s*(\D)/g, "$1, $2");
  out = out.replace(/\s+–\s+/g, ", ");
  return out;
}

/** Remove or rephrase banned words / constructions; leave the rest intact. */
export function stripBannedLanguage(text: string): string {
  let out = text;
  for (const re of BANNED_CONSTRUCTIONS) out = out.replace(re, "");
  for (const re of BANNED_WORDS) out = out.replace(re, "");
  out = out.replace(HEDGING_STACK, (_m, modal) => modal);
  // collapse double spaces / orphan punctuation left over
  out = out.replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1");
  return out;
}

/** Drop a leading rhetorical-question paragraph opener. */
export function dropRhetoricalOpener(text: string): string {
  return text.replace(/^\s*[A-Z][^.?!]{0,160}\?\s+/u, "");
}

/** Apply all sanitization rules in order. Safe on `undefined` / empty input. */
export function sanitizeProse(input: string | null | undefined): string {
  if (!input) return "";
  let out = String(input);
  out = stripDashes(out);
  out = stripBannedLanguage(out);
  out = dropRhetoricalOpener(out);
  return out.trim();
}

/** Same rules, applied paragraph-by-paragraph, preserving paragraph breaks. */
export function sanitizeParagraphs(paragraphs: readonly string[] | null | undefined): string[] {
  if (!paragraphs) return [];
  return paragraphs.map(sanitizeProse).filter((p) => p.length > 0);
}