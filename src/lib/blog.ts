import DOMPurify from "dompurify";

export interface LeadMagnetFields {
  first_name?: boolean;
  last_name?: boolean;
  company?: boolean;
  role?: boolean;
  country?: boolean;
  consent?: boolean;
}

export interface BlogPostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  content_html: string;
  gated_html: string | null;
  category: string | null;
  tags: string[];
  author_name: string | null;
  reading_minutes: number;
  seo_title: string | null;
  seo_description: string | null;
  published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  has_gated?: boolean;
  // Lead-magnet fields (admin-readable; public reads only the safe subset)
  lead_magnet_enabled?: boolean;
  lead_magnet_layout?: 'with_article' | 'form_only';
  lead_magnet_file_path?: string | null;
  lead_magnet_file_name?: string | null;
  lead_magnet_cta?: string | null;
  lead_magnet_fields?: LeadMagnetFields | null;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

const ALLOWED_TAGS = [
  "p", "br", "hr", "h1", "h2", "h3", "h4", "ul", "ol", "li",
  "strong", "em", "u", "s", "code", "pre", "blockquote",
  "a", "img", "figure", "figcaption",
  "table", "thead", "tbody", "tr", "th", "td",
  "span", "div",
];

const ALLOWED_ATTR = ["href", "src", "alt", "title", "target", "rel", "class", "colspan", "rowspan"];

export function sanitizeHtml(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * Inline gate marker. Authors can insert this anywhere in the public content
 * to split it into a "before gate" half and a "after gate" half.
 *
 * Implemented as a plain text token wrapped in a paragraph so the rich-text
 * editor (which strips HTML comments) preserves it through edits.
 */
export const INLINE_GATE_MARKER = "[[lovable-gate]]";

/** Split content_html by the inline gate marker, if present. */
export function splitByInlineGate(html: string): { before: string; after: string | null } {
  if (!html) return { before: "", after: null };
  // Match the text token, optionally wrapped in a <p> tag so that the rich-text
  // editor's paragraph wrapping doesn't leave dangling tags on either side.
  const re = /(?:<p[^>]*>\s*)?\[\[\s*lovable-gate\s*\]\](?:\s*<\/p>)?/i;
  const m = html.match(re);
  if (!m) return { before: html, after: null };
  const idx = m.index ?? -1;
  if (idx < 0) return { before: html, after: null };
  return {
    before: html.slice(0, idx),
    after: html.slice(idx + m[0].length),
  };
}

export function readingMinutes(html: string): number {
  const text = html.replace(/<[^>]+>/g, " ").trim();
  const words = text ? text.split(/\s+/).length : 0;
  return Math.max(1, Math.round(words / 220));
}

const UNLOCK_KEY = (slug: string) => `vela-blog-unlocked-${slug}`;

export function isUnlocked(slug: string): boolean {
  try { return localStorage.getItem(UNLOCK_KEY(slug)) === "1"; } catch { return false; }
}

export function markUnlocked(slug: string) {
  try { localStorage.setItem(UNLOCK_KEY(slug), "1"); } catch { /* noop */ }
}