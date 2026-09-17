// =====================================================================
// site-research — read a company's own website and return the raw pages.
//
// Used by the private-company / startup valuation so the appraisal can be
// grounded in what the company actually publishes (products, customers,
// pricing, team, locations, funding announcements) instead of asking the
// user to retype it. Nothing here interprets the content: the caller feeds
// the extracted text to the model with a strict "only what is written"
// instruction, and every fact keeps the page URL it came from.
// =====================================================================

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

export interface SitePage { url: string; title: string; text: string }

/** Pages worth reading for a valuation, in priority order. */
const PAGE_HINTS = [
  'about', 'chi-siamo', 'chisiamo', 'azienda', 'company', 'who-we-are',
  'product', 'prodotti', 'solutions', 'servizi', 'services', 'platform',
  'pricing', 'prezzi', 'plans', 'tariffe',
  'customers', 'clienti', 'case-stud', 'referenz',
  'team', 'leadership', 'management', 'founders',
  'investor', 'investitori', 'funding', 'press', 'news', 'media', 'blog',
  'careers', 'lavora-con-noi', 'jobs',
  'contact', 'contatti', 'impressum', 'legal', 'privacy',
];

export function normaliseWebsite(input: string): string | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes('.')) return null;
    return u.origin + (u.pathname === '/' ? '' : u.pathname);
  } catch { return null; }
}

/** Block internal / non-public targets so this helper cannot be used as an SSRF proxy. */
function isSafePublicUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host === '0.0.0.0' || host === '::1' || host === '::') return false;
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return false; // IPv6 ULA / link-local
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false; // cloud metadata service
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a >= 224) return false; // multicast / reserved
  }
  return true;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function titleOf(html: string, fallback: string): string {
  const m = html.match(/<title[^>]*>([\s\S]{1,200}?)<\/title>/i);
  return m ? stripHtml(m[1]).slice(0, 140) : fallback;
}

async function fetchPage(url: string, timeoutMs = 12_000): Promise<{ html: string; finalUrl: string } | null> {
  if (!isSafePublicUrl(url)) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, signal: ctrl.signal, redirect: 'follow' });
    if (!r.ok) return null;
    if (!isSafePublicUrl(r.url)) return null;
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.includes('html') && !ct.includes('text')) return null;
    const html = (await r.text()).slice(0, 400_000);
    return { html, finalUrl: r.url || url };
  } catch { return null; } finally { clearTimeout(t); }
}

function sameSiteLinks(html: string, base: string): string[] {
  const origin = new URL(base).origin;
  const out = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], base);
      if (u.origin !== origin) continue;
      if (!isSafePublicUrl(u.toString())) continue;
      if (/\.(pdf|jpg|jpeg|png|svg|gif|webp|zip|mp4|css|js)$/i.test(u.pathname)) continue;
      u.hash = '';
      out.add(u.toString().replace(/\/$/, ''));
    } catch { /* ignore malformed href */ }
  }
  return [...out];
}

/**
 * Read the homepage plus the highest-signal internal pages.
 * Returns cleaned text per page; the caller decides what it means.
 */
export async function readCompanySite(website: string, maxPages = 8): Promise<{ site: string; pages: SitePage[]; error?: string }> {
  const root = normaliseWebsite(website);
  if (!root) return { site: website, pages: [], error: 'invalid_url' };

  const home = await fetchPage(root);
  if (!home) return { site: root, pages: [], error: 'unreachable' };

  const pages: SitePage[] = [{ url: home.finalUrl, title: titleOf(home.html, root), text: stripHtml(home.html).slice(0, 14_000) }];

  const links = sameSiteLinks(home.html, home.finalUrl);
  const scored = links
    .map((u) => {
      const p = u.toLowerCase();
      const idx = PAGE_HINTS.findIndex((h) => p.includes(h));
      return { u, score: idx === -1 ? 999 : idx };
    })
    .filter((x) => x.score !== 999 && x.u !== home.finalUrl)
    .sort((a, b) => a.score - b.score)
    .slice(0, maxPages - 1);

  const fetched = await Promise.all(scored.map(async ({ u }) => {
    const p = await fetchPage(u, 9000);
    if (!p) return null;
    const text = stripHtml(p.html);
    if (text.length < 200) return null;
    return { url: p.finalUrl, title: titleOf(p.html, u), text: text.slice(0, 10_000) } as SitePage;
  }));

  for (const p of fetched) if (p) pages.push(p);
  return { site: root, pages };
}
