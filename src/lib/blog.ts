import DOMPurify from "dompurify";

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