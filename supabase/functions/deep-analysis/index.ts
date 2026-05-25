import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

interface Body { symbol: string; name?: string; currency?: string }

function n(v: any): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'object' && typeof v.raw === 'number') return v.raw;
  return null;
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
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
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
  };
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

async function aiNarrative(symbol: string, name: string, f: any, dcf: any, ddm: any) {
  const system = `You are a senior equity research analyst. Be concise, balanced, and number-driven. Return STRICT JSON only.`;
  const user = `Stock: ${name} (${symbol})
Fundamentals (compact JSON): ${JSON.stringify(f)}
DCF result: ${JSON.stringify(dcf)}
DDM result: ${JSON.stringify(ddm)}

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

  const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
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
    const dcf = dcfValuation(fundamentals);
    const ddm = ddmValuation(fundamentals);
    const ai = await aiNarrative(sym, body.name || fundamentals.longName || sym, fundamentals, dcf, ddm);

    return new Response(JSON.stringify({
      symbol: sym,
      fundamentals,
      valuation: { dcf, ddm },
      analysis: ai,
      generatedAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('deep-analysis error', e);
    return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});