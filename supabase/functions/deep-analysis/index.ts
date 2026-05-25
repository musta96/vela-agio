import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { resolveAIConfig, type AIConfig } from '../_shared/ai-provider.ts';
import { fetchAllByoFundamentals } from '../_shared/data-provider.ts';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

interface Body { symbol: string; name?: string; currency?: string }

function n(v: any): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'object' && typeof v.raw === 'number') return v.raw;
  return null;
}

let cachedCrumb: { crumb: string; cookie: string; at: number } | null = null;

async function getCrumb(): Promise<{ crumb: string; cookie: string }> {
  if (cachedCrumb && Date.now() - cachedCrumb.at < 30 * 60 * 1000) {
    return { crumb: cachedCrumb.crumb, cookie: cachedCrumb.cookie };
  }
  // Step 1: hit fc.yahoo.com to get session cookies
  const r1 = await fetch('https://fc.yahoo.com/', {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    redirect: 'manual',
  }).catch(() => null);
  const setCookies: string[] = [];
  if (r1) {
    const sc = r1.headers.get('set-cookie');
    if (sc) setCookies.push(sc);
  }
  // Fallback: also hit finance.yahoo.com which reliably sets A1/A3
  const r2 = await fetch('https://finance.yahoo.com/', {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    redirect: 'manual',
  });
  const sc2 = r2.headers.get('set-cookie');
  if (sc2) setCookies.push(sc2);

  // Build a minimal Cookie header from set-cookie strings
  const cookiePairs: string[] = [];
  for (const raw of setCookies) {
    // raw may contain multiple cookies separated by comma (Deno joins them).
    // Split on ", " followed by a cookie name= pattern.
    const parts = raw.split(/,(?=\s*[A-Za-z0-9_-]+=)/);
    for (const p of parts) {
      const kv = p.split(';')[0].trim();
      if (kv && kv.includes('=')) cookiePairs.push(kv);
    }
  }
  const cookie = cookiePairs.join('; ');

  const r3 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, Accept: 'text/plain', Cookie: cookie },
  });
  if (!r3.ok) throw new Error(`getcrumb ${r3.status}`);
  const crumb = (await r3.text()).trim();
  if (!crumb || crumb.length < 4) throw new Error('Empty crumb');
  cachedCrumb = { crumb, cookie, at: Date.now() };
  return { crumb, cookie };
}

async function fetchQuoteSummary(symbol: string) {
  const modules = [
    'summaryDetail',
    'defaultKeyStatistics',
    'financialData',
    'incomeStatementHistory',
    'cashflowStatementHistory',
    'balanceSheetHistory',
    'earnings',
    'recommendationTrend',
    'price',
    'assetProfile',
  ].join(',');
  const { crumb, cookie } = await getCrumb();
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json', Cookie: cookie },
  });
  if (r.status === 401 || r.status === 403) {
    // Invalidate crumb and retry once
    cachedCrumb = null;
    const fresh = await getCrumb();
    const r2 = await fetch(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(fresh.crumb)}`,
      { headers: { 'User-Agent': UA, Accept: 'application/json', Cookie: fresh.cookie } },
    );
    if (!r2.ok) throw new Error(`Yahoo quoteSummary ${r2.status}`);
    const j2 = await r2.json();
    return j2?.quoteSummary?.result?.[0] ?? null;
  }
  if (!r.ok) throw new Error(`Yahoo quoteSummary ${r.status}`);
  const j = await r.json();
  return j?.quoteSummary?.result?.[0] ?? null;
}

function extractFundamentals(q: any) {
  const sd = q?.summaryDetail ?? {};
  const ks = q?.defaultKeyStatistics ?? {};
  const fd = q?.financialData ?? {};
  const price = q?.price ?? {};
  const profile = q?.assetProfile ?? {};
  const cf = q?.cashflowStatementHistory?.cashflowStatements?.[0] ?? {};
  const inc = q?.incomeStatementHistory?.incomeStatementHistory?.[0] ?? {};
  const bs = q?.balanceSheetHistory?.balanceSheetStatements?.[0] ?? {};

  const fcf = (n(cf.totalCashFromOperatingActivities) ?? 0) + (n(cf.capitalExpenditures) ?? 0); // capex is negative
  return {
    symbol: price?.symbol,
    longName: price?.longName ?? price?.shortName,
    exchange: price?.exchangeName,
    sector: profile?.sector,
    industry: profile?.industry,
    website: profile?.website,
    currency: price?.currency,
    marketCap: n(price?.marketCap),
    price: n(price?.regularMarketPrice),
    sharesOutstanding: n(ks?.sharesOutstanding),
    beta: n(sd?.beta) ?? n(ks?.beta),
    peTrailing: n(sd?.trailingPE),
    peForward: n(sd?.forwardPE) ?? n(ks?.forwardPE),
    pegRatio: n(ks?.pegRatio),
    priceToBook: n(ks?.priceToBook),
    priceToSales: n(sd?.priceToSalesTrailing12Months),
    evToEbitda: n(ks?.enterpriseToEbitda),
    dividendYield: n(sd?.dividendYield),
    dividendRate: n(sd?.dividendRate),
    payoutRatio: n(sd?.payoutRatio),
    profitMargin: n(fd?.profitMargins) ?? n(ks?.profitMargins),
    operatingMargin: n(fd?.operatingMargins),
    grossMargin: n(fd?.grossMargins),
    returnOnEquity: n(fd?.returnOnEquity),
    returnOnAssets: n(fd?.returnOnAssets),
    revenue: n(fd?.totalRevenue) ?? n(inc?.totalRevenue),
    revenueGrowth: n(fd?.revenueGrowth),
    earningsGrowth: n(fd?.earningsGrowth),
    grossProfit: n(inc?.grossProfit),
    ebitda: n(fd?.ebitda),
    netIncome: n(inc?.netIncome),
    totalCash: n(fd?.totalCash),
    totalDebt: n(fd?.totalDebt),
    debtToEquity: n(fd?.debtToEquity),
    currentRatio: n(fd?.currentRatio),
    bookValue: n(ks?.bookValue),
    epsTrailing: n(ks?.trailingEps),
    epsForward: n(ks?.forwardEps),
    freeCashFlow: n(fd?.freeCashflow) ?? (fcf !== 0 ? fcf : null),
    operatingCashflow: n(fd?.operatingCashflow) ?? n(cf?.totalCashFromOperatingActivities),
    targetMeanPrice: n(fd?.targetMeanPrice),
    targetHighPrice: n(fd?.targetHighPrice),
    targetLowPrice: n(fd?.targetLowPrice),
    recommendationMean: n(fd?.recommendationMean),
    recommendationKey: fd?.recommendationKey,
    numberOfAnalystOpinions: n(fd?.numberOfAnalystOpinions),
    fiftyTwoWeekHigh: n(sd?.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: n(sd?.fiftyTwoWeekLow),
    averageVolume: n(sd?.averageVolume),
    averageVolume10days: n(sd?.averageVolume10days) ?? n(sd?.averageDailyVolume10Day),
    floatShares: n(ks?.floatShares),
  };
}

function liquidityProfile(f: ReturnType<typeof extractFundamentals>) {
  const v = f.averageVolume ?? f.averageVolume10days;
  if (!v || !f.price) return null;
  const dollar = v * f.price;
  let tier: "very-liquid" | "liquid" | "moderate" | "thin" | "illiquid";
  if (dollar > 100e6) tier = "very-liquid";
  else if (dollar > 25e6) tier = "liquid";
  else if (dollar > 5e6) tier = "moderate";
  else if (dollar > 1e6) tier = "thin";
  else tier = "illiquid";
  return { avgVolume: v, avgDollarVolume: dollar, tier };
}

function dcfValuation(f: ReturnType<typeof extractFundamentals>) {
  const fcf = f.freeCashFlow;
  const shares = f.sharesOutstanding;
  if (!fcf || !shares || shares <= 0 || fcf <= 0) return null;
  const growth = Math.max(-0.05, Math.min(0.20, f.revenueGrowth ?? f.earningsGrowth ?? 0.05));
  const terminalGrowth = 0.025;
  const discount = 0.09 + Math.max(0, ((f.beta ?? 1) - 1) * 0.02); // crude WACC proxy
  let value = 0;
  let cf = fcf;
  for (let y = 1; y <= 10; y++) {
    const g = y <= 5 ? growth : (growth + terminalGrowth) / 2;
    cf = cf * (1 + g);
    value += cf / Math.pow(1 + discount, y);
  }
  const terminal = (cf * (1 + terminalGrowth)) / (discount - terminalGrowth);
  value += terminal / Math.pow(1 + discount, 10);
  const netCash = (f.totalCash ?? 0) - (f.totalDebt ?? 0);
  const equity = value + netCash;
  const perShare = equity / shares;
  return {
    perShare,
    assumptions: { growth, terminalGrowth, discount, years: 10 },
    upside: f.price ? (perShare - f.price) / f.price : null,
  };
}

function ddmValuation(f: ReturnType<typeof extractFundamentals>) {
  const div = f.dividendRate;
  if (!div || div <= 0) return null;
  const growth = Math.max(0, Math.min(0.08, (f.earningsGrowth ?? 0.04) * (1 - (f.payoutRatio ?? 0.5))));
  const discount = 0.09 + Math.max(0, ((f.beta ?? 1) - 1) * 0.02);
  if (discount <= growth + 0.005) return null;
  const perShare = (div * (1 + growth)) / (discount - growth);
  return {
    perShare,
    assumptions: { dividend: div, growth, discount },
    upside: f.price ? (perShare - f.price) / f.price : null,
  };
}

async function aiNarrative(cfg: AIConfig, symbol: string, name: string, f: any, dcf: any, ddm: any, liquidity: any) {
  const system = `You are a senior equity research analyst. Be concise, balanced, and number-driven. Return STRICT JSON only.`;
  const user = `Stock: ${name} (${symbol})
Fundamentals (compact JSON): ${JSON.stringify(f)}
DCF result: ${JSON.stringify(dcf)}
DDM result: ${JSON.stringify(ddm)}
Liquidity profile: ${JSON.stringify(liquidity)} — if tier is "thin" or "illiquid", call out tradability/liquidity risk explicitly in risks.

Return JSON with shape:
{
  "thesis": "2-3 sentence investment thesis grounded in the numbers",
  "strengths": ["...", "..."],
  "risks": ["...", "..."],
  "moat": "short text on competitive moat",
  "valuation": "1-2 sentences on whether the stock looks cheap/fair/expensive",
  "scenarios": {
    "bull": { "price": <number>, "probability": <0-1>, "rationale": "..." },
    "base": { "price": <number>, "probability": <0-1>, "rationale": "..." },
    "bear": { "price": <number>, "probability": <0-1>, "rationale": "..." }
  },
  "recommendation": "Buy" | "Hold" | "Sell" | "Accumulate" | "Trim",
  "horizon": "e.g. 12 months"
}
Prices must be plausible absolute prices in the stock's currency, anchored to current price ${f.price} and intrinsic values.`;

  const r = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: 'POST',
    headers: cfg.headers,
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!r.ok) throw new Error(`AI gateway ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const txt = j?.choices?.[0]?.message?.content ?? '{}';
  try { return JSON.parse(txt); } catch { return { raw: txt }; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    if (!body?.symbol) {
      return new Response(JSON.stringify({ error: 'symbol required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const sym = body.symbol.toUpperCase();
    const q = await fetchQuoteSummary(sym);
    if (!q) throw new Error('No data from Yahoo');
    const fundamentals = extractFundamentals(q);
    // Phase 2: optionally enrich with BYO providers (FMP, AlphaVantage). Never throws.
    const byoFundamentals = await fetchAllByoFundamentals(req.headers.get('Authorization'), sym);
    const dcf = dcfValuation(fundamentals);
    const ddm = ddmValuation(fundamentals);
    const liquidity = liquidityProfile(fundamentals);
    const cfg = await resolveAIConfig(req.headers.get('Authorization'));
    const enrichedForAi = byoFundamentals.length
      ? { ...fundamentals, _byo: byoFundamentals.map(b => ({ source: b.source, snapshot: b.data })) }
      : fundamentals;
    const ai = await aiNarrative(cfg, sym, body.name || fundamentals.longName || sym, enrichedForAi, dcf, ddm, liquidity);

    return new Response(JSON.stringify({
      symbol: sym,
      fundamentals,
      byoFundamentals: byoFundamentals.length ? byoFundamentals : undefined,
      liquidity,
      valuation: { dcf, ddm },
      analysis: ai,
      ai_meta: { provider: cfg.effectiveProvider, model: cfg.model, source: cfg.source, notice: cfg.notice ?? null },
      generatedAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('deep-analysis error', e);
    return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});