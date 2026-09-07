import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { fetchFundamentals } from '../_shared/fundamentals.ts';
import { computeRoicWacc } from '../_shared/roic-wacc.ts';
import { resolveAIConfig, chatComplete } from '../_shared/ai-provider.ts';
import { readCompanySite, type SitePage } from '../_shared/site-research.ts';
import { valueStartup, type StartupInputs, type Stage } from '../_shared/startup-valuation.ts';


// =====================================================================
// valuation — one endpoint for
//   mode:"public"   -> DCF, DDM, ROIC/WACC and comparable multiples for a ticker
//   mode:"private"  -> full company appraisal ("perizia di valutazione d'azienda"):
//                      comparable discovery from a business description,
//                      WACC build-up with size / specific / country risk,
//                      DCF, market multiples, adjusted net asset method,
//                      sensitivity grid, jurisdiction-specific requirements
//                      and section-by-section professional narrative that can
//                      ingest business plan / financial statements / contracts.
// =====================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

async function callEdge(fn: string, body: unknown, auth: string | null) {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: auth ?? `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify(body),
    });
    return await r.json();
  } catch { return null; }
}

type Num = number | null;
const n = (v: unknown, d = 0): number => (Number.isFinite(Number(v)) ? Number(v) : d);
const median = (xs: number[]): Num => {
  const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// ---------------------------------------------------------------- WACC
interface WaccBuild {
  riskFree: number; erp: number; beta: number; sizePremium: number; specificPremium: number; countryPremium: number;
  costOfEquity: number; costOfDebt: number; taxRate: number; debtWeight: number; wacc: number;
}
function buildWacc(a: Record<string, unknown>): WaccBuild {
  const riskFree = n(a.riskFree, 0.035);
  const erp = n(a.erp, 0.055);
  const beta = n(a.beta, 1.0);
  const sizePremium = n(a.sizePremium, 0.03);
  const specificPremium = n(a.specificPremium, 0.02);
  const countryPremium = n(a.countryPremium, 0);
  const taxRate = n(a.taxRate, 0.24);
  const costOfDebt = n(a.costOfDebt, 0.055);
  const debtWeight = Math.min(Math.max(n(a.debtWeight, 0.3), 0), 0.9);
  const costOfEquity = riskFree + beta * erp + sizePremium + specificPremium + countryPremium;
  const wacc = costOfEquity * (1 - debtWeight) + costOfDebt * (1 - taxRate) * debtWeight;
  return { riskFree, erp, beta, sizePremium, specificPremium, countryPremium, costOfEquity, costOfDebt, taxRate, debtWeight, wacc };
}

// ----------------------------------------------------------------- DCF
interface DcfOut {
  years: number[]; fcf: number[]; discounted: number[];
  pvExplicit: number; terminalValue: number; pvTerminal: number;
  enterpriseValue: number; netDebt: number; equityValue: number;
  wacc: number; terminalGrowth: number; method: string;
}
function runDcf(opts: {
  baseFcf: number; growth: number[]; wacc: number; terminalGrowth: number; netDebt: number; exitMultiple?: number; terminalEbitda?: number;
}): DcfOut {
  const { baseFcf, growth, wacc, terminalGrowth, netDebt } = opts;
  const fcf: number[] = [];
  let cur = baseFcf;
  for (const g of growth) { cur = cur * (1 + g); fcf.push(cur); }
  const discounted = fcf.map((f, i) => f / Math.pow(1 + wacc, i + 1));
  const pvExplicit = discounted.reduce((a, b) => a + b, 0);
  const last = fcf[fcf.length - 1] ?? baseFcf;
  const useExit = !!opts.exitMultiple && !!opts.terminalEbitda;
  const terminalValue = useExit
    ? opts.exitMultiple! * opts.terminalEbitda!
    : (wacc > terminalGrowth ? (last * (1 + terminalGrowth)) / (wacc - terminalGrowth) : last * 15);
  const pvTerminal = terminalValue / Math.pow(1 + wacc, growth.length);
  const enterpriseValue = pvExplicit + pvTerminal;
  return {
    years: growth.map((_, i) => new Date().getFullYear() + i + 1),
    fcf, discounted, pvExplicit, terminalValue, pvTerminal, enterpriseValue,
    netDebt, equityValue: enterpriseValue - netDebt, wacc, terminalGrowth,
    method: useExit ? 'exit multiple' : 'Gordon growth',
  };
}

function sensitivity(baseFcf: number, growth: number[], wacc: number, g: number, netDebt: number) {
  const waccs = [-0.02, -0.01, 0, 0.01, 0.02].map((d) => +(wacc + d).toFixed(4));
  const grows = [-0.01, -0.005, 0, 0.005, 0.01].map((d) => +(g + d).toFixed(4));
  return {
    waccs, growths: grows,
    grid: waccs.map((w) => grows.map((gr) => +runDcf({ baseFcf, growth, wacc: w, terminalGrowth: gr, netDebt }).equityValue.toFixed(0))),
  };
}

// --------------------------------------------------------------- Public
async function publicValuation(symbol: string, body: Record<string, unknown>, auth: string | null) {
  const f = await fetchFundamentals(symbol);
  if (!f) throw new Error(`No fundamentals available for ${symbol}`);
  const rw = await computeRoicWacc(symbol).catch(() => null);
  const a = (body.assumptions ?? {}) as Record<string, unknown>;
  const years = Math.min(Math.max(n(a.forecastYears, 5), 3), 10);
  const growthRate = n(a.growth, Math.min(Math.max(n(f.revGrowth, 0.05), -0.05), 0.20));
  const fade = n(a.fade, 0.15);
  const growth = Array.from({ length: years }, (_, i) => growthRate * Math.pow(1 - fade, i));
  const wacc = buildWacc({ ...a, beta: n(a.beta, n(f.beta, 1)), sizePremium: n(a.sizePremium, 0), specificPremium: n(a.specificPremium, 0) });
  const baseFcf = n(f.fcf, n(f.marketCap, 0) * 0.04);
  const netDebt = n((f as unknown as Record<string, number>).netDebt, 0);
  const dcf = runDcf({ baseFcf, growth, wacc: wacc.wacc, terminalGrowth: n(a.terminalGrowth, 0.02), netDebt });

  // DDM (two-stage Gordon on the current dividend)
  const price = n(f.price, 0);
  const dps = n(f.divYield, 0) * price;
  const ddmGrowth = Math.min(n(a.dividendGrowth, 0.03), wacc.costOfEquity - 0.005);
  const ddmValue = dps > 0 && wacc.costOfEquity > ddmGrowth ? (dps * (1 + ddmGrowth)) / (wacc.costOfEquity - ddmGrowth) : null;

  // Comparables
  const peerSyms: string[] = Array.isArray(body.peers) && body.peers.length
    ? (body.peers as string[]).slice(0, 8)
    : (await callEdge('related-instruments', { symbol, limit: 6 }, auth))?.symbols ?? [];
  const peers = (await Promise.all(peerSyms.slice(0, 8).map((s) => fetchFundamentals(String(s)).catch(() => null)))).filter(Boolean) as Array<NonNullable<Awaited<ReturnType<typeof fetchFundamentals>>>>;
  const comps = {
    peers: peers.map((p) => ({ symbol: p.symbol, name: p.name, pe: p.pe, evEbitda: p.evEbitda, ps: p.ps, pb: p.pb, marketCap: p.marketCap })),
    median: {
      pe: median(peers.map((p) => n(p.pe, NaN))),
      evEbitda: median(peers.map((p) => n(p.evEbitda, NaN))),
      ps: median(peers.map((p) => n(p.ps, NaN))),
      pb: median(peers.map((p) => n(p.pb, NaN))),
    },
  };
  const shares = n(f.marketCap, 0) / (price || 1);
  const impliedFromPe = comps.median.pe && f.pe ? price * (comps.median.pe / n(f.pe, 1)) : null;
  const impliedFromPs = comps.median.ps && f.ps ? price * (comps.median.ps / n(f.ps, 1)) : null;

  const perShareDcf = shares > 0 ? dcf.equityValue / shares : null;
  return {
    mode: 'public', symbol: f.symbol, name: f.name, currency: f.currency, price,
    fundamentals: f, roicWacc: rw, wacc,
    dcf: { ...dcf, perShare: perShareDcf, upsidePct: perShareDcf && price ? ((perShareDcf - price) / price) * 100 : null },
    ddm: { dps, growth: ddmGrowth, value: ddmValue, upsidePct: ddmValue && price ? ((ddmValue - price) / price) * 100 : null },
    comparables: comps,
    impliedPrices: { dcf: perShareDcf, ddm: ddmValue, peerPe: impliedFromPe, peerPs: impliedFromPs, analystTarget: f.targetMean },
    sensitivity: sensitivity(baseFcf, growth, wacc.wacc, n(a.terminalGrowth, 0.02), netDebt),
  };
}

// -------------------------------------------------------------- Private
const DEFAULT_SECTIONS = [
  'executive_summary', 'engagement_scope', 'company_overview', 'market_analysis',
  'financial_analysis', 'normalisation_adjustments', 'methodology', 'wacc_buildup',
  'dcf_valuation', 'market_multiples', 'asset_based', 'discounts_premia',
  'sensitivity', 'valuation_conclusion', 'jurisdiction_requirements', 'limitations_disclaimer',
];

async function findComparables(cfg: Awaited<ReturnType<typeof resolveAIConfig>>, profile: Record<string, unknown>) {
  const sys = 'You are an M&A analyst. Given a private company description, return STRICT JSON {"tickers":["..."],"rationale":"..."} listing 4-8 LISTED comparable companies as Yahoo Finance tickers (use the local listing, e.g. ENEL.MI, ASML.AS, 6758.T). Prefer same sector, similar business model and comparable geography/size.';
  try {
    const r = await chatComplete(cfg, {
      messages: [{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify(profile).slice(0, 4000) }],
      temperature: 0.1, response_format: { type: 'json_object' },
    });
    if (!r.ok) return { tickers: [] as string[], rationale: '' };
    const j = await r.json();
    const parsed = JSON.parse((j?.choices?.[0]?.message?.content ?? '{}').replace(/^```json\s*|```$/g, ''));
    return { tickers: (parsed.tickers ?? []).slice(0, 8).map(String), rationale: String(parsed.rationale ?? '') };
  } catch { return { tickers: [] as string[], rationale: '' }; }
}

async function jurisdictionRules(country: string, auth: string | null) {
  const q = `${country} business valuation report legal requirements expert appraisal standards ("perizia di stima" OR "valuation report" OR "expert report") company law`;
  const res = await callEdge('web-research', { query: q, lane: 'regulatory', max_results: 5, fetch_pages: true }, auth);
  return (res?.results ?? res?.hits ?? []).slice(0, 5).map((h: Record<string, unknown>) => ({
    title: String(h.title ?? ''), url: String(h.url ?? ''), excerpt: String(h.excerpt ?? '').slice(0, 1200),
  }));
}

/**
 * Read the financial history out of the uploaded documents (bilanci, business
 * plan) when the user has not typed the grid by hand. Figures are only taken
 * from the documents — the model must not invent anything.
 */
async function extractFinancialsFromDocs(
  cfg: Awaited<ReturnType<typeof resolveAIConfig>>,
  docs: Array<{ name: string; text: string }>,
): Promise<{ rows: Array<Record<string, unknown>>; unit: string; notes: string }> {
  if (!docs.length) return { rows: [], unit: '1', notes: '' };
  const sys = `You extract financial history from company documents for a valuation.
Return STRICT JSON {"unit":"1|1000|1000000","rows":[{"year":2025,"revenue":0,"ebitda":0,"ebit":0,"da":0,"netIncome":0,"capex":0,"nwcChange":0,"netDebt":0,"equity":0}],"notes":"..."}.
Rules: use ONLY figures present in the documents; omit any field you cannot find (do not guess); "unit" is the multiplier that converts the reported figures to absolute currency units (e.g. 1000 when the statements are in EUR thousands); net debt is positive when the company is a net borrower; notes must say which document and period each figure came from.`;
  const digest = docs.slice(0, 6).map((d) => `### ${d.name}\n${String(d.text ?? '').slice(0, 8000)}`).join('\n\n');
  try {
    const r = await chatComplete(cfg, {
      messages: [{ role: 'system', content: sys }, { role: 'user', content: digest }],
      temperature: 0, response_format: { type: 'json_object' },
    });
    if (!r.ok) return { rows: [], unit: '1', notes: '' };
    const j = await r.json();
    const parsed = JSON.parse((j?.choices?.[0]?.message?.content ?? '{}').replace(/^```json\s*|```$/g, ''));
    const mult = Number(parsed.unit ?? 1) || 1;
    const rows = (Array.isArray(parsed.rows) ? parsed.rows : []).map((row: Record<string, unknown>) => {
      const out: Record<string, unknown> = { year: row.year };
      for (const k of ['revenue', 'ebitda', 'ebit', 'da', 'netIncome', 'capex', 'nwcChange', 'netDebt', 'equity']) {
        const v = Number(row[k]);
        if (Number.isFinite(v)) out[k] = v * mult;
      }
      return out;
    }).filter((row: Record<string, unknown>) => Number.isFinite(Number(row.revenue)) || Number.isFinite(Number(row.ebitda)));
    return { rows, unit: String(mult), notes: String(parsed.notes ?? '') };
  } catch { return { rows: [], unit: '1', notes: '' }; }
}


/**
 * Read the company's own website and turn it into *sourced* facts.
 * The model may only report what is written on the pages: every fact carries
 * the URL it was read from, and anything absent stays absent.
 */
async function researchWebsite(
  cfg: Awaited<ReturnType<typeof resolveAIConfig>>,
  website: string,
): Promise<{
  site: string; pagesRead: Array<{ url: string; title: string }>; error?: string;
  facts: Array<{ field: string; value: string; source: string }>;
  summary: string; products: string[]; customers: string[]; markets: string[];
  team: string[]; funding: string[]; missing: string[];
} | null> {
  const read = await readCompanySite(website, 8);
  if (!read.pages.length) {
    return { site: read.site, pagesRead: [], error: read.error ?? 'no_content', facts: [], summary: '', products: [], customers: [], markets: [], team: [], funding: [], missing: ['Website could not be read'] };
  }
  const sys = `You read a company's own website to support a valuation.
Return STRICT JSON {"summary":"","products":[],"customers":[],"markets":[],"team":[],"funding":[],"facts":[{"field":"","value":"","source":"<page url>"}],"missing":[]}.
HARD RULES: use ONLY text present in the supplied pages. Never infer, estimate or invent revenue, headcount, funding, customers or dates. Every entry in "facts" must quote or closely paraphrase the page and cite the exact page URL it came from. Put anything a valuer would need but the site does not state into "missing". Keep it factual, no marketing adjectives.`;
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
          console.error('site-research ai error', r.status, detail);
          aiError = r.status === 402 || r.status === 403
            ? 'AI credits are unavailable, so the pages were fetched but not read. Add credits or your own API key in Settings > Connections.'
            : `The AI could not read the pages (HTTP ${r.status}).`;
          continue;
        }
        const j = await r.json();
        const content = j?.choices?.[0]?.message?.content ?? '';
        const candidate = JSON.parse(String(content).replace(/^```json\s*|```$/g, ''));
        if (candidate && (candidate.summary || (Array.isArray(candidate.facts) && candidate.facts.length))) { parsed = candidate; break; }
      } catch (e) { console.error('site-research parse failed', e instanceof Error ? e.message : e); }
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

async function privateValuation(body: Record<string, unknown>, auth: string | null) {
  const profile = (body.profile ?? {}) as Record<string, unknown>;
  const country = String(profile.country ?? 'IT');
  const currency = String(profile.currency ?? 'EUR');
  const fin = (Array.isArray(body.financials) ? body.financials : []) as Array<Record<string, unknown>>;
  const a = (body.assumptions ?? {}) as Record<string, unknown>;
  const sections: string[] = Array.isArray(body.sections) && body.sections.length ? (body.sections as string[]) : DEFAULT_SECTIONS;
  const docs = (Array.isArray(body.documents) ? body.documents : []) as Array<{ name: string; text: string }>;

  const cfg = await resolveAIConfig(auth);
  const website = String(profile.website ?? body.website ?? '').trim();
  const siteResearch = website ? await researchWebsite(cfg, website) : null;

  // A manually typed grid always wins; otherwise read the numbers out of the
  // uploaded statements so an upload alone produces a real valuation.
  const hasManualFigures = fin.some((row) =>
    ['revenue', 'ebitda', 'ebit', 'netIncome', 'equity'].some((k) => Number.isFinite(Number(row[k])) && Number(row[k]) !== 0));
  let financialsSource: 'manual' | 'documents' | 'none' = hasManualFigures ? 'manual' : 'none';
  let extractionNotes = '';
  let history = fin;
  if (!hasManualFigures && docs.length) {
    const extracted = await extractFinancialsFromDocs(cfg, docs);
    if (extracted.rows.length) {
      history = extracted.rows;
      financialsSource = 'documents';
      extractionNotes = extracted.notes;
    }
  }

  const last = history[history.length - 1] ?? {};
  const revenue = n(last.revenue);
  const ebitda = n(last.ebitda, revenue * 0.15);
  const ebit = n(last.ebit, ebitda * 0.75);
  const capex = n(last.capex, revenue * 0.04);
  const nwc = n(last.nwcChange, 0);
  const da = n(last.da, Math.max(ebitda - ebit, 0));
  const netDebt = n(last.netDebt, 0);
  const equityBook = n(last.equity, 0);

  const wacc = buildWacc({ countryPremium: country === 'IT' ? 0.015 : 0, ...a });
  const taxRate = wacc.taxRate;
  const baseFcf = n(a.baseFcf, ebit * (1 - taxRate) + da - capex - nwc);
  const yrs = Math.min(Math.max(n(a.forecastYears, 5), 3), 10);
  const g0 = n(a.growth, 0.06);
  const fade = n(a.fade, 0.2);
  const growth = Array.from({ length: yrs }, (_, i) => g0 * Math.pow(1 - fade, i));
  const dcf = runDcf({
    baseFcf, growth, wacc: wacc.wacc, terminalGrowth: n(a.terminalGrowth, 0.015), netDebt,
    exitMultiple: a.exitMultiple ? n(a.exitMultiple) : undefined,
    terminalEbitda: ebitda * Math.pow(1 + g0, yrs),
  });

  const [compFind, rules] = await Promise.all([
    findComparables(cfg, {
      ...profile,
      description: body.description ?? profile.description,
      website_summary: siteResearch?.summary,
      website_products: siteResearch?.products,
      website_markets: siteResearch?.markets,
      revenue, ebitda,
    }),
    sections.includes('jurisdiction_requirements') ? jurisdictionRules(country, auth) : Promise.resolve([]),
  ]);
  const peers = (await Promise.all(compFind.tickers.map((t) => fetchFundamentals(t).catch(() => null)))).filter(Boolean) as Array<NonNullable<Awaited<ReturnType<typeof fetchFundamentals>>>>;
  const medEvEbitda = median(peers.map((p) => n(p.evEbitda, NaN)));
  const medPs = median(peers.map((p) => n(p.ps, NaN)));
  const medPe = median(peers.map((p) => n(p.pe, NaN)));

  const illiquidity = n(a.illiquidityDiscount, 0.25);
  const control = n(a.controlPremium, 0);
  const multiplesEv = medEvEbitda ? medEvEbitda * ebitda : null;
  const multiplesEquity = multiplesEv != null ? multiplesEv - netDebt : null;
  const netIncome = n(last.netIncome, ebit * (1 - taxRate));
  const peEquity = medPe ? medPe * netIncome : null;
  const psEquity = medPs ? medPs * revenue - netDebt : null;
  const assetEquity = equityBook + n(a.assetRevaluation, 0) - n(a.hiddenLiabilities, 0);

  const applyAdj = (v: number | null) => (v == null ? null : v * (1 - illiquidity) * (1 + control));
  const conclusions = {
    dcf: applyAdj(dcf.equityValue),
    multiplesEvEbitda: applyAdj(multiplesEquity),
    multiplesPe: applyAdj(peEquity),
    multiplesPs: applyAdj(psEquity),
    adjustedNetAsset: assetEquity,
  };
  // A method with no usable inputs (e.g. no book equity for the asset method)
  // returns zero — it must not drag the valuation range down to nil.
  const vals = Object.values(conclusions).filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  const range = vals.length ? { low: Math.min(...vals), mid: median(vals), high: Math.max(...vals) } : null;

  // ---- narrative -------------------------------------------------
  const docDigest = docs.slice(0, 6).map((d) => `### ${d.name}\n${String(d.text ?? '').slice(0, 6000)}`).join('\n\n');
  const sys = `You are a senior valuation partner (M&A / commercialista / CTU) writing a formal company appraisal ("perizia di valutazione d'azienda") for ${country}.
Write ONLY the requested sections, as STRICT JSON: {"sections":{"<section_id>":"markdown text"},"key_findings":["..."],"open_items":["..."]}.
Standards: state methods used and why, reference the applicable local requirements when provided, distinguish audited data from management estimates, never invent figures not present in the inputs, and flag every material assumption. Language: ${String(body.language ?? 'it')}. Professional, defensible, no marketing tone.`;
  const user = `PROFILE: ${JSON.stringify(profile)}
FINANCIAL HISTORY (source: ${financialsSource}${extractionNotes ? `; extraction notes: ${extractionNotes}` : ''}): ${JSON.stringify(history)}
ASSUMPTIONS/WACC: ${JSON.stringify(wacc)}
DCF: ${JSON.stringify({ ...dcf, discounted: undefined })}
COMPARABLES: ${JSON.stringify({ tickers: compFind.tickers, rationale: compFind.rationale, medians: { evEbitda: medEvEbitda, pe: medPe, ps: medPs } })}
VALUATION CONCLUSIONS (${currency}): ${JSON.stringify({ conclusions, range, illiquidity, control })}
LOCAL REQUIREMENTS SOURCES: ${JSON.stringify(rules)}
COMPANY WEBSITE EVIDENCE (read from the company's own site; cite the URL when you use a fact, and never extend beyond it):
${siteResearch ? JSON.stringify({ site: siteResearch.site, pages: siteResearch.pagesRead, summary: siteResearch.summary, products: siteResearch.products, customers: siteResearch.customers, markets: siteResearch.markets, team: siteResearch.team, funding: siteResearch.funding, facts: siteResearch.facts, not_disclosed: siteResearch.missing }) : '(no website supplied)'}
CLIENT DOCUMENTS (business plan / statements / contracts):
${docDigest || '(none supplied)'}
SECTIONS REQUESTED: ${sections.join(', ')}`;

  let narrative: Record<string, unknown> = { sections: {}, key_findings: [], open_items: [] };
  try {
    const r = await chatComplete(cfg, {
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user.slice(0, 90_000) }],
      temperature: 0.2, response_format: { type: 'json_object' },
    });
    if (r.ok) {
      const j = await r.json();
      narrative = JSON.parse((j?.choices?.[0]?.message?.content ?? '{}').replace(/^```json\s*|```$/g, ''));
    }
  } catch { /* keep empty narrative */ }

  return {
    mode: 'private', profile, currency, country, sections,
    inputs: { revenue, ebitda, ebit, da, capex, nwcChange: nwc, netDebt, equityBook, baseFcf },
    wacc, dcf,
    comparables: {
      rationale: compFind.rationale,
      peers: peers.map((p) => ({ symbol: p.symbol, name: p.name, evEbitda: p.evEbitda, pe: p.pe, ps: p.ps, marketCap: p.marketCap, sector: p.sector })),
      medians: { evEbitda: medEvEbitda, pe: medPe, ps: medPs },
    },
    discounts: { illiquidityDiscount: illiquidity, controlPremium: control },
    conclusions, range,
    sensitivity: sensitivity(baseFcf, growth, wacc.wacc, n(a.terminalGrowth, 0.015), netDebt),
    jurisdiction: { country, sources: rules },
    documentsUsed: docs.map((d) => d.name),
    websiteResearch: siteResearch,
    financials: history,
    financialsSource,
    extractionNotes,
    narrative,
  };
}


// -------------------------------------------------------------- Startup
const STARTUP_SECTIONS = [
  'executive_summary', 'company_overview', 'market_analysis', 'traction',
  'methodology', 'method_results', 'round_terms', 'cap_table_impact',
  'benchmarks', 'risks', 'valuation_conclusion', 'limitations_disclaimer',
];

async function startupValuation(body: Record<string, unknown>, auth: string | null) {
  const profile = (body.profile ?? {}) as Record<string, unknown>;
  const inputs = (body.startup ?? {}) as Record<string, unknown>;
  const country = String(profile.country ?? 'IT');
  const currency = String(profile.currency ?? 'EUR');
  const sections: string[] = Array.isArray(body.sections) && body.sections.length ? (body.sections as string[]) : STARTUP_SECTIONS;
  const docs = (Array.isArray(body.documents) ? body.documents : []) as Array<{ name: string; text: string }>;

  const cfg = await resolveAIConfig(auth);
  const website = String(profile.website ?? body.website ?? '').trim();
  const siteResearch = website ? await researchWebsite(cfg, website) : null;

  const si: StartupInputs = {
    stage: String(inputs.stage ?? 'seed') as Stage,
    country, currency,
    sector: String(profile.sector ?? inputs.sector ?? 'software'),
    revenue: n(inputs.revenue),
    revenueGrowth: Number.isFinite(Number(inputs.revenueGrowth)) ? Number(inputs.revenueGrowth) : undefined,
    grossMargin: Number.isFinite(Number(inputs.grossMargin)) ? Number(inputs.grossMargin) : undefined,
    burnRate: n(inputs.burnRate),
    cashOnHand: n(inputs.cashOnHand),
    users: n(inputs.users),
    roundSize: n(inputs.roundSize),
    targetOwnership: n(inputs.targetOwnership),
    optionPool: n(inputs.optionPool),
    previousRounds: Array.isArray(inputs.previousRounds) ? inputs.previousRounds as StartupInputs['previousRounds'] : [],
    requiredIrr: Number.isFinite(Number(inputs.requiredIrr)) && Number(inputs.requiredIrr) > 0 ? Number(inputs.requiredIrr) : undefined,
    yearsToExit: Number.isFinite(Number(inputs.yearsToExit)) && Number(inputs.yearsToExit) > 0 ? Number(inputs.yearsToExit) : undefined,
    exitMultiple: Number.isFinite(Number(inputs.exitMultiple)) && Number(inputs.exitMultiple) > 0 ? Number(inputs.exitMultiple) : undefined,
    exitRevenue: n(inputs.exitRevenue),
    scorecard: (inputs.scorecard ?? {}) as StartupInputs['scorecard'],
    riskFactors: (inputs.riskFactors ?? {}) as StartupInputs['riskFactors'],
    berkus: (inputs.berkus ?? {}) as StartupInputs['berkus'],
  };
  const result = valueStartup(si);

  // Listed comparables give a public-market anchor for the sector multiple.
  const compFind = await findComparables(cfg, {
    ...profile,
    description: body.description ?? profile.description,
    website_summary: siteResearch?.summary,
    stage: si.stage, revenue: si.revenue,
  });
  const peers = (await Promise.all(compFind.tickers.map((t) => fetchFundamentals(t).catch(() => null)))).filter(Boolean) as Array<NonNullable<Awaited<ReturnType<typeof fetchFundamentals>>>>;
  const peerPs = median(peers.map((p) => n(p.ps, NaN)));

  const sys = `You are a venture capital investment partner writing the valuation section of an investment memo for a ${si.stage.replace('_', ' ')} startup in ${country}.
Return STRICT JSON {"sections":{"<section_id>":"markdown text"},"key_findings":["..."],"open_items":["..."],"negotiation_range":"..."}.
Rules: explain WHY each method lands where it does and which ones deserve weight at this stage; never invent traction, funding or customer figures that are not in the inputs or the website evidence; cite the website URL when you use a website fact; state the benchmark source when you use stage/region benchmarks; flag down-round, runway and dilution issues plainly. Language: ${String(body.language ?? (country === 'IT' ? 'it' : 'en'))}.`;
  const user = `PROFILE: ${JSON.stringify(profile)}
STARTUP INPUTS: ${JSON.stringify(si)}
METHOD RESULTS (${currency}): ${JSON.stringify(result)}
LISTED COMPARABLES: ${JSON.stringify({ tickers: compFind.tickers, rationale: compFind.rationale, medianPs: peerPs })}
WEBSITE EVIDENCE: ${siteResearch ? JSON.stringify(siteResearch) : '(no website supplied)'}
DOCUMENTS: ${docs.slice(0, 6).map((d) => `### ${d.name}\n${String(d.text ?? '').slice(0, 6000)}`).join('\n\n') || '(none)'}
SECTIONS REQUESTED: ${sections.join(', ')}`;

  let narrative: Record<string, unknown> = { sections: {}, key_findings: [], open_items: [] };
  try {
    const r = await chatComplete(cfg, {
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user.slice(0, 90_000) }],
      temperature: 0.2, response_format: { type: 'json_object' },
    });
    if (r.ok) {
      const j = await r.json();
      narrative = JSON.parse((j?.choices?.[0]?.message?.content ?? '{}').replace(/^```json\s*|```$/g, ''));
    }
  } catch { /* keep empty narrative */ }

  return {
    mode: 'startup', profile, country, currency, sections,
    ...result,
    comparables: {
      rationale: compFind.rationale, medianPs: peerPs,
      peers: peers.map((p) => ({ symbol: p.symbol, name: p.name, ps: p.ps, evEbitda: p.evEbitda, marketCap: p.marketCap, sector: p.sector })),
    },
    websiteResearch: siteResearch,
    documentsUsed: docs.map((d) => d.name),
    narrative,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization');
    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode ?? 'public');
    const out = mode === 'startup'
      ? await startupValuation(body, auth)
      : mode === 'private'
        ? await privateValuation(body, auth)
        : await publicValuation(String(body.symbol ?? '').toUpperCase(), body, auth);
    return json(out);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'valuation failed' }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

export { DEFAULT_SECTIONS, STARTUP_SECTIONS };
