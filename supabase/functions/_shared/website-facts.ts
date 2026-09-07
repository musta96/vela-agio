// =====================================================================
// website-facts — read a company's own website and turn it into *sourced*
// facts. The model may only report what is written on the pages: every fact
// carries the URL it was read from, and anything absent stays absent.
//
// Shared by the valuation engine (private companies, startups) and by the
// listed stock / fund pages, so an analysis can be grounded in what the
// company itself publishes rather than in model recollection.
// =====================================================================

import { readCompanySite, type SitePage } from './site-research.ts';
import { chatComplete, type AIConfig } from './ai-provider.ts';

export interface WebsiteResearch {
  site: string;
  pagesRead: Array<{ url: string; title: string }>;
  error?: string;
  facts: Array<{ field: string; value: string; source: string }>;
  summary: string;
  products: string[];
  customers: string[];
  markets: string[];
  team: string[];
  funding: string[];
  missing: string[];
}

export async function researchWebsite(cfg: AIConfig, website: string, maxPages = 8): Promise<WebsiteResearch> {
  const read = await readCompanySite(website, maxPages);
  if (!read.pages.length) {
    return {
      site: read.site, pagesRead: [], error: read.error ?? 'no_content', facts: [],
      summary: '', products: [], customers: [], markets: [], team: [], funding: [],
      missing: ['Website could not be read'],
    };
  }
  const sys = `You read a company's own website to support an investment analysis.
Return STRICT JSON {"summary":"","products":[],"customers":[],"markets":[],"team":[],"funding":[],"facts":[{"field":"","value":"","source":"<page url>"}],"missing":[]}.
HARD RULES: use ONLY text present in the supplied pages. Never infer, estimate or invent revenue, headcount, funding, customers or dates. Every entry in "facts" must quote or closely paraphrase the page and cite the exact page URL it came from. Put anything an analyst would need but the site does not state into "missing". Keep it factual, no marketing adjectives.`;
  // Large marketing sites can blow past the model's context; retry on a
  // shorter digest rather than losing the website evidence entirely.
  const build = (per: number, cap: number) =>
    read.pages.map((pg: SitePage) => `### ${pg.title}\nURL: ${pg.url}\n${pg.text.slice(0, per)}`).join('\n\n').slice(0, cap);
  const attempts = [build(7000, 60_000), build(2500, 22_000)];
  try {
    let parsed: Record<string, unknown> | null = null;
    let aiError = '';
    for (const digest of attempts) {
      try {
        const r = await chatComplete(cfg, {
          messages: [{ role: 'system', content: sys }, { role: 'user', content: digest }],
          temperature: 0, response_format: { type: 'json_object' },
        });
        if (!r.ok) {
          const detail = (await r.text()).slice(0, 300);
          console.error('website-facts ai error', r.status, detail);
          aiError = r.status === 402 || r.status === 403
            ? 'AI credits are unavailable, so the pages were fetched but not read. Add credits or your own API key in Settings > Connections.'
            : `The AI could not read the pages (HTTP ${r.status}).`;
          continue;
        }
        const j = await r.json();
        const content = j?.choices?.[0]?.message?.content ?? '';
        const candidate = JSON.parse(String(content).replace(/^```json\s*|```$/g, ''));
        if (candidate && (candidate.summary || (Array.isArray(candidate.facts) && candidate.facts.length))) { parsed = candidate; break; }
      } catch (e) { console.error('website-facts parse failed', e instanceof Error ? e.message : e); }
    }
    if (!parsed) throw new Error(aiError || 'ai_failed');
    const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).slice(0, 12) : []);
    const pageUrls = new Set(read.pages.map((pg) => pg.url));
    return {
      site: read.site,
      pagesRead: read.pages.map((pg) => ({ url: pg.url, title: pg.title })),
      summary: String(parsed.summary ?? ''),
      products: arr(parsed.products), customers: arr(parsed.customers), markets: arr(parsed.markets),
      team: arr(parsed.team), funding: arr(parsed.funding), missing: arr(parsed.missing),
      // Drop any "fact" that does not point at a page we actually fetched.
      facts: (Array.isArray(parsed.facts) ? parsed.facts : [])
        .map((f: Record<string, unknown>) => ({ field: String(f.field ?? ''), value: String(f.value ?? ''), source: String(f.source ?? '') }))
        .filter((f: { source: string; value: string }) => f.value && (pageUrls.has(f.source) || [...pageUrls].some((u) => f.source.startsWith(u))))
        .slice(0, 40),
    };
  } catch (e) {
    const why = e instanceof Error && e.message !== 'ai_failed' ? e.message : 'The pages were fetched but could not be summarised.';
    return {
      site: read.site, pagesRead: read.pages.map((pg) => ({ url: pg.url, title: pg.title })),
      facts: [], summary: '', products: [], customers: [], markets: [], team: [], funding: [],
      missing: [why],
    };
  }
}
