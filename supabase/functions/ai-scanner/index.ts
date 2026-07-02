import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { resolveAIConfig, type AIConfig } from '../_shared/ai-provider.ts';
import { resolveAiAccess, aiDeniedResponse } from '../_shared/ai-access.ts';

interface Bar { t: number; close: number }

const UNIVERSES: Record<string, { name: string; symbols: string[] }> = {
  ftse_mib: {
    name: 'FTSE MIB',
    symbols: ['ISP.MI','UCG.MI','ENI.MI','ENEL.MI','STLAM.MI','RACE.MI','STM.MI','G.MI','MB.MI','BAMI.MI','MONC.MI','PRY.MI','LDO.MI','TIT.MI','TRN.MI','SRG.MI','PST.MI','AZM.MI','ATL.MI','REC.MI'],
  },
  sp100: {
    name: 'S&P 100 (subset)',
    symbols: ['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','BRK-B','JPM','V','UNH','XOM','JNJ','WMT','MA','PG','HD','CVX','LLY','ABBV','KO','PEP','BAC','AVGO','MRK'],
  },
  eu_blue: {
    name: 'European blue chips',
    symbols: ['ASML.AS','MC.PA','OR.PA','SAP.DE','SIE.DE','TTE.PA','NESN.SW','ROG.SW','NOVN.SW','SHEL.L','HSBA.L','AZN.L','ULVR.L','RIO.L','BP.L','BAS.DE','ALV.DE','BAYN.DE','SAN.PA','AIR.PA'],
  },
};

async function fetchBars(symbol: string): Promise<Bar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=6mo`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return [];
    const j = await res.json();
    const r = j?.chart?.result?.[0];
    const ts: number[] = r?.timestamp ?? [];
    const cl: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
    const out: Bar[] = [];
    for (let i = 0; i < ts.length; i++) { const c = cl[i]; if (typeof c === 'number') out.push({ t: ts[i] * 1000, close: c }); }
    return out;
  } catch { return []; }
}

function metrics(bars: Bar[]) {
  const c = bars.map(b => b.close); const n = c.length; if (n < 60) return null;
  const last = c[n - 1];
  const ret = (d: number) => ((last - c[Math.max(0, n - 1 - d)]) / c[Math.max(0, n - 1 - d)]) * 100;
  const sma = (p: number) => { let s = 0; for (let i = n - p; i < n; i++) s += c[i]; return s / p; };
  const sma50 = sma(50), sma20 = sma(20);
  let g = 0, l = 0; for (let i = n - 14; i < n; i++) { const d = c[i] - c[i - 1]; if (d >= 0) g += d; else l -= d; }
  const rsi = l === 0 ? 100 : 100 - 100 / (1 + (g / 14) / (l / 14));
  const rets: number[] = []; for (let i = 1; i < n; i++) rets.push((c[i] - c[i - 1]) / c[i - 1]);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  const vol = Math.sqrt(variance) * Math.sqrt(252) * 100;
  return { price: +last.toFixed(2), ret1m: +ret(21).toFixed(2), ret3m: +ret(63).toFixed(2), ret6m: +ret(Math.min(n - 1, 126)).toFixed(2), rsi14: +rsi.toFixed(1), sma20: +sma20.toFixed(2), sma50: +sma50.toFixed(2), vol_ann_pct: +vol.toFixed(1), above_sma50: last > sma50 };
}

async function rankWithAI(authHeader: string | null, criteria: string, rows: any[]): Promise<{ ranked: any[]; commentary: string }> {
  const cfg: AIConfig = await resolveAIConfig(authHeader);
  const prompt = `You are a buy-side analyst. The user's criteria: "${criteria || 'balanced quality + momentum, low volatility'}".
Rank the following candidates from BEST to WORST fit. Return STRICT JSON only.
Schema: { "ranked": [{ "symbol": string, "score": number, "thesis": string, "risk": string }], "commentary": string }
Use score 0-100. Thesis <= 220 chars. Risk <= 120 chars. Commentary <= 400 chars.
Candidates: ${JSON.stringify(rows).slice(0, 12000)}`;
  try {
    const r = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST',
      headers: cfg.headers,
      body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } }),
    });
    if (!r.ok) return { ranked: rows, commentary: `AI error ${r.status}` };
    const j = await r.json();
    const txt = j?.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(txt);
    return { ranked: parsed.ranked ?? rows, commentary: parsed.commentary ?? '' };
  } catch (e) {
    return { ranked: rows, commentary: `AI parse failed: ${(e as Error).message}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const __aiAccess = await resolveAiAccess(req.headers.get('Authorization'));
  if (!__aiAccess.allowed) return aiDeniedResponse(__aiAccess, corsHeaders);
  try {
    const { universe = 'ftse_mib', symbols, criteria = '', limit = 10 } = await req.json();
    let list: string[] = Array.isArray(symbols) && symbols.length ? symbols.map(String) : UNIVERSES[universe]?.symbols ?? UNIVERSES.ftse_mib.symbols;
    list = list.slice(0, 25);
    const data = await Promise.all(list.map(async (s) => ({ symbol: s, ...(metrics(await fetchBars(s)) ?? {}) })));
    const valid = data.filter((d: any) => typeof d.price === 'number');
    const { ranked, commentary } = await rankWithAI(req.headers.get('Authorization'), criteria, valid);
    const top = ranked.slice(0, limit);
    return new Response(JSON.stringify({ universe, count: valid.length, top, commentary, generated_at: new Date().toISOString() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});