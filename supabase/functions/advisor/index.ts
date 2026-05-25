import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { resolveAIConfig } from '../_shared/ai-provider.ts';
import { getInvestorProfileSummary } from '../_shared/investor-profile.ts';

type Holding = { symbol: string; name?: string; shares: number; avg_price: number; current_price?: number };

async function yahooNews(symbol: string) {
  try {
    const u = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=5&quotesCount=0`;
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return [];
    const j = await r.json();
    return (j?.news ?? []).slice(0, 5).map((n: any) => ({
      title: n.title, publisher: n.publisher, time: n.providerPublishTime, link: n.link,
    }));
  } catch { return []; }
}

async function yahooQuote(symbol: string) {
  try {
    const u = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return null;
    const j = await r.json();
    const q = j?.quoteResponse?.result?.[0];
    if (!q) return null;
    return {
      price: q.regularMarketPrice,
      changePct: q.regularMarketChangePercent,
      pe: q.trailingPE,
      fwdPe: q.forwardPE,
      dy: q.trailingAnnualDividendYield,
      mktCap: q.marketCap,
      sector: q.sector,
      industry: q.industry,
      currency: q.currency,
      fiftyTwoHigh: q.fiftyTwoWeekHigh,
      fiftyTwoLow: q.fiftyTwoWeekLow,
    };
  } catch { return null; }
}

async function weather(city?: string) {
  if (!city) return null;
  try {
    const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
    const gj = await g.json();
    const loc = gj?.results?.[0];
    if (!loc) return null;
    const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,precipitation,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=7&timezone=auto`);
    const wj = await w.json();
    return { city: loc.name, country: loc.country, current: wj.current, daily: wj.daily };
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { holdings = [], goals = {}, riskProfile = 'balanced', weatherCity, lang = 'en' } = await req.json() as {
      holdings: Holding[]; goals: Record<string, unknown>; riskProfile?: string; weatherCity?: string; lang?: string;
    };
    const langName = lang === 'it' ? 'Italian' : 'English';

    const enriched = await Promise.all(holdings.slice(0, 25).map(async (h) => {
      const [q, news] = await Promise.all([yahooQuote(h.symbol), yahooNews(h.symbol)]);
      const value = (q?.price ?? h.current_price ?? h.avg_price) * h.shares;
      const pl = ((q?.price ?? 0) - h.avg_price) * h.shares;
      const plPct = q?.price ? ((q.price - h.avg_price) / h.avg_price) * 100 : null;
      return { ...h, quote: q, news, value, pl, plPct };
    }));
    const totalValue = enriched.reduce((s, x) => s + (x.value || 0), 0) || 1;
    const positions = enriched.map(e => ({
      symbol: e.symbol,
      name: e.name,
      shares: e.shares,
      avg_price: e.avg_price,
      price: e.quote?.price,
      weightPct: +(100 * (e.value || 0) / totalValue).toFixed(2),
      plPct: e.plPct != null ? +e.plPct.toFixed(2) : null,
      sector: e.quote?.sector,
      industry: e.quote?.industry,
      fwdPe: e.quote?.fwdPe,
      dy: e.quote?.dy,
      pctFrom52High: e.quote?.fiftyTwoHigh ? +(100 * ((e.quote.price - e.quote.fiftyTwoHigh) / e.quote.fiftyTwoHigh)).toFixed(2) : null,
      headlines: e.news.map((n: any) => n.title),
    }));

    const wx = await weather(weatherCity);

    const sys = `You are a senior buy-side portfolio manager and behavioral coach for a retail investor.
You MUST respond in ${langName}.
You analyze: holdings, valuation, momentum vs 52-week high, sector concentration, recent NEWS headlines (politics, wars, macro), upcoming/expected REGULATION worldwide and country-specific that may affect industries, and optionally weather signals (heatwaves, droughts, hurricanes) for agri/utilities/insurance/tourism exposure.
You return STRICT JSON with these top-level keys:
- sell_signals: array of { symbol, action: "sell_all" | "trim" | "hold" | "add", trim_pct (0-100), urgency: "high"|"medium"|"low", target_price?: number, stop_price?: number, rationale: string (<=400 chars), catalysts: string[] }
- improvements: array of { title, type: "diversification"|"risk"|"goal_alignment"|"tax"|"cost", detail: string, suggested_trades?: string[] }
- macro_context: { politics: string, regulation: string, weather: string }
- portfolio_summary: { concentration_risk: string, sector_tilt: string, goal_fit: string }
- disclaimer: string
Be specific and quantitative when possible. NEVER fabricate news; if no headline supports a claim, say "no headline-driven catalyst". This is educational, not financial advice.`;

    const investorProfile = await getInvestorProfileSummary(req.headers.get('Authorization'));
    const user = `RISK PROFILE: ${riskProfile}
INVESTOR SUITABILITY (MiFID II): ${investorProfile ?? 'not completed — invite user to fill /suitability'}
GOALS: ${JSON.stringify(goals).slice(0, 1500)}
WEATHER CONTEXT (optional, for weather-sensitive holdings): ${JSON.stringify(wx).slice(0, 1500)}
POSITIONS (${positions.length}, total value ${totalValue.toFixed(0)}):
${JSON.stringify(positions).slice(0, 12000)}`;

    const cfg = await resolveAIConfig(req.headers.get('Authorization'));
    const r = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST',
      headers: cfg.headers,
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (r.status === 402) return new Response(JSON.stringify({ error: 'credits_exhausted' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const j = await r.json();
    let out: any = {};
    try { out = JSON.parse(j?.choices?.[0]?.message?.content ?? '{}'); } catch {}
    out._meta = { weather: wx?.city ?? null, positions: positions.length, totalValue, ai_provider: cfg.effectiveProvider, ai_model: cfg.model, ai_source: cfg.source, ai_notice: cfg.notice ?? null };
    return new Response(JSON.stringify(out), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});