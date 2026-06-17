import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// ============================================================================
// Vela Advisor v2 — Multi-strategy, cross-asset, gated order-plan engine
// ============================================================================

type Holding = { symbol: string; name?: string; shares: number; avg_price: number; current_price?: number; currency?: string };

type StrategyResult = {
  name: string;
  label: string;
  family: 'risk' | 'return' | 'diversification' | 'tilt';
  weights: Record<string, number>;
  stats: { ann_return: number; ann_vol: number; sharpe: number; max_dd: number };
  turnover_pct: number;
  suitability_fit: number; // 0..1
  score: number;
  rationale: string;
};

type OrderRow = {
  seq: number;
  action: string;
  asset_class: string;
  symbol: string;
  symbol_label?: string;
  side: string;
  qty: number;
  order_type: string;
  limit_price?: number;
  est_price?: number;
  est_notional?: number;
  currency: string;
  rationale: string;
  option_structure?: string;
  option_expiry?: string;
  option_strike?: number;
  option_right?: string;
};

// ---------- pure-JS optimizers (mirror of src/lib/optimizer.ts) -------------
function mean(xs: number[]) { return xs.reduce((a, b) => a + b, 0) / (xs.length || 1); }
function stdev(xs: number[]) { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)); }
function cov(returns: number[][]) {
  const n = returns[0]?.length ?? 0, T = returns.length;
  const means = Array.from({ length: n }, (_, j) => mean(returns.map(r => r[j])));
  const c: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
    let s = 0; for (let t = 0; t < T; t++) s += (returns[t][i] - means[i]) * (returns[t][j] - means[j]);
    const v = s / Math.max(1, T - 1); c[i][j] = v; c[j][i] = v;
  }
  return c;
}
function riskParity(c: number[][]) {
  const inv = c.map((r, i) => 1 / Math.max(1e-8, Math.sqrt(r[i])));
  const s = inv.reduce((a, b) => a + b, 0); return inv.map(v => v / s);
}
function meanVariance(returns: number[][]) {
  const n = returns[0]?.length ?? 0; if (!n) return [];
  const mu = Array.from({ length: n }, (_, j) => mean(returns.map(r => r[j])));
  const c = cov(returns);
  let w = Array(n).fill(1 / n);
  for (let it = 0; it < 400; it++) {
    const cw = c.map(r => r.reduce((a, b, k) => a + b * w[k], 0));
    const grad = mu.map((m, i) => -m + 2 * cw[i]);
    w = w.map((x, i) => Math.max(0, x - 0.05 * grad[i]));
    const s = w.reduce((a, b) => a + b, 0) || 1; w = w.map(x => x / s);
  }
  return w;
}
function minVariance(returns: number[][]) {
  const n = returns[0]?.length ?? 0; if (!n) return [];
  const c = cov(returns);
  let w = Array(n).fill(1 / n);
  for (let it = 0; it < 400; it++) {
    const cw = c.map(r => r.reduce((a, b, k) => a + b * w[k], 0));
    w = w.map((x, i) => Math.max(0, x - 0.05 * (2 * cw[i])));
    const s = w.reduce((a, b) => a + b, 0) || 1; w = w.map(x => x / s);
  }
  return w;
}
function hrp(c: number[][]) {
  const n = c.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => c[a][a] - c[b][b]);
  const w = Array(n).fill(0);
  function bi(items: number[], a: number) {
    if (items.length === 1) { w[items[0]] += a; return; }
    const mid = Math.floor(items.length / 2);
    const L = items.slice(0, mid), R = items.slice(mid);
    const vL = L.reduce((s, i) => s + c[i][i], 0) / L.length, vR = R.reduce((s, i) => s + c[i][i], 0) / R.length;
    const aL = 1 - vL / (vL + vR);
    bi(L, a * aL); bi(R, a * (1 - aL));
  }
  bi(order, 1); return w;
}
function momentum(returns: number[][]) {
  const n = returns[0]?.length ?? 0;
  const recent = returns.slice(-60);
  const m = Array.from({ length: n }, (_, j) => mean(recent.map(r => r[j])));
  const pos = m.map(v => Math.max(0, v));
  const s = pos.reduce((a, b) => a + b, 0);
  return s > 0 ? pos.map(v => v / s) : Array(n).fill(1 / n);
}
function lowVolTilt(returns: number[][]) {
  const n = returns[0]?.length ?? 0;
  const vols = Array.from({ length: n }, (_, j) => stdev(returns.map(r => r[j])) || 1e-6);
  const inv = vols.map(v => 1 / v);
  const s = inv.reduce((a, b) => a + b, 0); return inv.map(v => v / s);
}

function portfolioStats(w: number[], returns: number[][]) {
  const T = returns.length;
  const port = returns.map(r => r.reduce((s, x, i) => s + x * w[i], 0));
  const annR = mean(port) * 252;
  const annV = stdev(port) * Math.sqrt(252);
  const sharpe = annV > 0 ? annR / annV : 0;
  // approximate max drawdown
  let peak = 1, eq = 1, dd = 0;
  for (const r of port) { eq *= 1 + r; peak = Math.max(peak, eq); dd = Math.min(dd, eq / peak - 1); }
  return { ann_return: annR, ann_vol: annV, sharpe, max_dd: dd, _T: T };
}

// ---------- yahoo daily history ---------------------------------------------
async function yahooHistory(symbol: string, days = 260): Promise<{ closes: number[]; price?: number; currency?: string }> {
  try {
    const period2 = Math.floor(Date.now() / 1000);
    const period1 = period2 - days * 24 * 60 * 60;
    const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return { closes: [] };
    const j = await r.json();
    const result = j?.chart?.result?.[0];
    const closes: number[] = (result?.indicators?.quote?.[0]?.close ?? []).filter((x: any) => x != null);
    const price = result?.meta?.regularMarketPrice;
    const currency = result?.meta?.currency;
    return { closes, price, currency };
  } catch { return { closes: [] }; }
}

function returnsFromCloses(allCloses: number[][]): number[][] {
  // align lengths (trim to shortest)
  const minLen = Math.min(...allCloses.map(c => c.length));
  if (minLen < 20) return [];
  const trimmed = allCloses.map(c => c.slice(c.length - minLen));
  const out: number[][] = [];
  for (let t = 1; t < minLen; t++) {
    out.push(trimmed.map(c => (c[t] - c[t - 1]) / (c[t - 1] || 1)));
  }
  return out;
}

// ---------- universe baskets per asset class --------------------------------
const UNIVERSE = {
  bond: [
    { symbol: 'TLT', label: 'iShares 20+Y Treasury', currency: 'USD' },
    { symbol: 'IEF', label: 'iShares 7-10Y Treasury', currency: 'USD' },
    { symbol: 'AGG', label: 'iShares US Aggregate Bond', currency: 'USD' },
    { symbol: 'BTPS.MI', label: 'iShares Italy Govt Bond', currency: 'EUR' },
    { symbol: 'IBGL.L', label: 'iShares Euro Govt Bond 15-30Y', currency: 'EUR' },
  ],
  commodity: [
    { symbol: 'GLD', label: 'SPDR Gold Shares', currency: 'USD' },
    { symbol: 'SLV', label: 'iShares Silver Trust', currency: 'USD' },
    { symbol: 'USO', label: 'United States Oil Fund', currency: 'USD' },
    { symbol: 'UNG', label: 'United States Natural Gas', currency: 'USD' },
    { symbol: 'DBC', label: 'Invesco DB Commodity Index', currency: 'USD' },
  ],
  crypto: [
    { symbol: 'BTC-USD', label: 'Bitcoin', currency: 'USD' },
    { symbol: 'ETH-USD', label: 'Ethereum', currency: 'USD' },
    { symbol: 'IBIT', label: 'iShares Bitcoin Trust ETF', currency: 'USD' },
  ],
  hedge: [
    { symbol: 'SH', label: 'ProShares Short S&P500', currency: 'USD' },
    { symbol: 'PSQ', label: 'ProShares Short QQQ', currency: 'USD' },
    { symbol: 'VIXY', label: 'ProShares VIX Short-Term', currency: 'USD' },
  ],
};

// ---------- gating ----------------------------------------------------------
type Gating = {
  unrestricted_master: boolean;
  allow_cross_asset: boolean;
  allow_shorts: boolean;
  allow_derivatives: boolean;
  suitability_completed: boolean;
  risk_level?: number | null;
  decisions: { feature: string; allowed: boolean; reason: string }[];
};

async function loadGating(authHeader: string | null): Promise<Gating> {
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const h = { apikey: anon, Authorization: authHeader ?? `Bearer ${anon}` };
  let masterOn = false;
  try {
    const f = await fetch(`${url}/rest/v1/feature_flags?key=eq.advisor_unrestricted_enabled&select=enabled`, { headers: h });
    const rows = await f.json();
    masterOn = !!rows?.[0]?.enabled;
  } catch {}
  let profile: any = {};
  if (authHeader) {
    try {
      const p = await fetch(`${url}/rest/v1/profiles?select=allow_cross_asset,allow_shorts,allow_derivatives,unrestricted_advice&limit=1`, { headers: h });
      profile = (await p.json())?.[0] ?? {};
    } catch {}
  }
  let suit: any = null;
  if (authHeader) {
    try {
      const s = await fetch(`${url}/rest/v1/investor_profiles?select=completed_at,risk_level&limit=1`, { headers: h });
      suit = (await s.json())?.[0] ?? null;
    } catch {}
  }
  const suitOk = !!suit?.completed_at;
  const sri = suit?.risk_level ?? null;
  const overrideOn = !!profile.unrestricted_advice;
  const allow_cross_asset = masterOn && (overrideOn || !!profile.allow_cross_asset);
  const allow_shorts = masterOn && overrideOn && !!profile.allow_shorts && suitOk && (sri ?? 0) >= 5;
  const allow_derivatives = masterOn && overrideOn && !!profile.allow_derivatives && suitOk && (sri ?? 0) >= 6;
  const decisions = [
    { feature: 'cross_asset', allowed: allow_cross_asset, reason: !masterOn ? 'owner master switch off' : !(overrideOn || profile.allow_cross_asset) ? 'profile toggle off' : 'enabled' },
    { feature: 'shorts', allowed: allow_shorts, reason: !masterOn ? 'owner master switch off' : !overrideOn ? 'unrestricted_advice off' : !profile.allow_shorts ? 'profile toggle off' : !suitOk ? 'suitability incomplete' : (sri ?? 0) < 5 ? `SRI ${sri ?? '?'} below threshold 5` : 'enabled' },
    { feature: 'derivatives', allowed: allow_derivatives, reason: !masterOn ? 'owner master switch off' : !overrideOn ? 'unrestricted_advice off' : !profile.allow_derivatives ? 'profile toggle off' : !suitOk ? 'suitability incomplete' : (sri ?? 0) < 6 ? `SRI ${sri ?? '?'} below threshold 6` : 'enabled' },
  ];
  return { unrestricted_master: masterOn, allow_cross_asset, allow_shorts, allow_derivatives, suitability_completed: suitOk, risk_level: sri, decisions };
}

// ---------- main engine -----------------------------------------------------
function suitabilityFit(stats: { ann_vol: number; max_dd: number }, riskProfile: string) {
  const target: Record<string, { vol: number; dd: number }> = {
    conservative: { vol: 0.08, dd: -0.12 },
    balanced:     { vol: 0.14, dd: -0.20 },
    growth:       { vol: 0.20, dd: -0.30 },
    aggressive:   { vol: 0.30, dd: -0.45 },
  };
  const t = target[riskProfile] ?? target.balanced;
  const volPen = Math.max(0, stats.ann_vol - t.vol) / Math.max(0.01, t.vol);
  const ddPen = Math.max(0, Math.abs(stats.max_dd) - Math.abs(t.dd)) / Math.max(0.01, Math.abs(t.dd));
  return Math.max(0, 1 - 0.6 * volPen - 0.4 * ddPen);
}

function scoreStrategy(stats: { sharpe: number; max_dd: number }, turnover: number, fit: number) {
  return 1.2 * stats.sharpe - 0.7 * Math.abs(stats.max_dd) - 0.4 * turnover + 0.8 * fit;
}

function buildWeightMap(symbols: string[], weights: number[]) {
  const m: Record<string, number> = {};
  symbols.forEach((s, i) => { m[s] = weights[i] || 0; });
  return m;
}

function turnoverVs(current: Record<string, number>, target: Record<string, number>) {
  const keys = new Set([...Object.keys(current), ...Object.keys(target)]);
  let t = 0;
  for (const k of keys) t += Math.abs((target[k] ?? 0) - (current[k] ?? 0));
  return t / 2;
}

function blendTop(strategies: StrategyResult[], topN = 3): Record<string, number> {
  const top = strategies.slice(0, topN);
  const totalScore = top.reduce((s, x) => s + Math.max(0, x.score), 0) || 1;
  const blended: Record<string, number> = {};
  for (const st of top) {
    const w = Math.max(0, st.score) / totalScore;
    for (const [sym, v] of Object.entries(st.weights)) {
      blended[sym] = (blended[sym] ?? 0) + w * v;
    }
  }
  // normalize
  const sum = Object.values(blended).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(blended)) blended[k] = blended[k] / sum;
  return blended;
}

function generateOrders(
  current: { symbol: string; shares: number; price: number; currency: string; asset_class: string; symbol_label?: string }[],
  target: Record<string, number>,
  priceMap: Record<string, number>,
  currencyMap: Record<string, string>,
  classMap: Record<string, string>,
  labelMap: Record<string, string>,
  totalValue: number,
  gating: Gating,
): OrderRow[] {
  const orders: OrderRow[] = [];
  let seq = 1;
  const symbolsAll = new Set([...current.map(c => c.symbol), ...Object.keys(target)]);
  for (const sym of symbolsAll) {
    const cur = current.find(c => c.symbol === sym);
    const tgtW = target[sym] ?? 0;
    const curW = cur ? (cur.shares * cur.price) / Math.max(1, totalValue) : 0;
    const driftW = tgtW - curW;
    if (Math.abs(driftW) < 0.005) continue; // <0.5% — ignore
    const price = priceMap[sym] ?? cur?.price ?? 0;
    if (!price) continue;
    const targetNotional = tgtW * totalValue;
    const curNotional = curW * totalValue;
    const deltaNotional = targetNotional - curNotional;
    const deltaShares = Math.round((deltaNotional / price) * 100) / 100;
    const assetClass = classMap[sym] ?? cur?.asset_class ?? 'equity';
    const isCrossAsset = ['bond', 'commodity', 'crypto', 'hedge'].includes(assetClass);
    if (isCrossAsset && !gating.allow_cross_asset) continue;
    const isShort = deltaShares < 0 && !cur;
    if (isShort && !gating.allow_shorts) continue;
    const action = !cur ? 'buy_new'
      : deltaShares > 0 ? 'add_to'
      : Math.abs(deltaShares) >= cur.shares ? 'sell_all'
      : 'trim_n_shares';
    const qty = Math.abs(deltaShares);
    if (qty < 0.0001) continue;
    orders.push({
      seq: seq++,
      action,
      asset_class: assetClass,
      symbol: sym,
      symbol_label: labelMap[sym] ?? cur?.symbol_label,
      side: deltaShares > 0 ? 'buy' : 'sell',
      qty,
      order_type: 'limit',
      limit_price: price,
      est_price: price,
      est_notional: Math.abs(deltaNotional),
      currency: currencyMap[sym] ?? cur?.currency ?? 'USD',
      rationale: action === 'buy_new'
        ? `Open new ${assetClass} position to reach target ${(tgtW * 100).toFixed(1)}% weight.`
        : action === 'sell_all'
        ? `Strategies agree on exiting this position entirely.`
        : action === 'add_to'
        ? `Increase weight from ${(curW * 100).toFixed(1)}% to ${(tgtW * 100).toFixed(1)}%.`
        : `Trim ${qty} shares to bring weight from ${(curW * 100).toFixed(1)}% to ${(tgtW * 100).toFixed(1)}%.`,
    });
  }
  // Optional protective put on biggest equity if derivatives allowed and drawdown profile is conservative-ish
  if (gating.allow_derivatives) {
    const biggest = current.sort((a, b) => b.shares * b.price - a.shares * a.price)[0];
    if (biggest) {
      const strike = Math.round(biggest.price * 0.92);
      const expiry = new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10);
      orders.push({
        seq: seq++,
        action: 'open_option',
        asset_class: 'option',
        symbol: biggest.symbol,
        symbol_label: `${biggest.symbol} ${expiry} ${strike}P`,
        side: 'buy_to_open',
        qty: Math.max(1, Math.floor(biggest.shares / 100)),
        order_type: 'limit',
        limit_price: undefined,
        est_price: undefined,
        est_notional: undefined,
        currency: biggest.currency,
        rationale: `Protective put: cap downside on the largest equity position at roughly -8% from spot for the next quarter.`,
        option_structure: 'protective_put',
        option_expiry: expiry,
        option_strike: strike,
        option_right: 'put',
      });
    }
  }
  return orders;
}

// ---------- handler ---------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    const holdings: Holding[] = body.holdings ?? [];
    const cash: number = Number(body.cash ?? 0);
    const riskProfile: string = body.riskProfile ?? 'balanced';
    const baseCurrency: string = body.baseCurrency ?? 'EUR';
    const portfolioId: string | undefined = body.portfolioId;
    const persist: boolean = body.persist !== false;

    if (!holdings.length) {
      return new Response(JSON.stringify({ error: 'no_holdings' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const authHeader = req.headers.get('Authorization');
    const gating = await loadGating(authHeader);

    // Build universe = holdings + cross-asset baskets (if cross-asset allowed)
    const heldSymbols = holdings.slice(0, 30).map(h => h.symbol);
    const extra: { symbol: string; label: string; currency: string; asset_class: string }[] = [];
    if (gating.allow_cross_asset) {
      for (const cls of ['bond', 'commodity', 'crypto'] as const) {
        for (const a of UNIVERSE[cls]) extra.push({ ...a, asset_class: cls });
      }
      if (gating.allow_shorts) {
        for (const a of UNIVERSE.hedge) extra.push({ ...a, asset_class: 'hedge' });
      }
    }
    const allSymbols = [...heldSymbols, ...extra.map(e => e.symbol)];

    // Fetch histories in parallel
    const histories = await Promise.all(allSymbols.map(s => yahooHistory(s)));
    // Filter out symbols with too little history
    const kept: { symbol: string; closes: number[]; price: number; currency: string; asset_class: string; label?: string }[] = [];
    histories.forEach((h, i) => {
      const sym = allSymbols[i];
      if (h.closes.length >= 60 && h.price && h.price > 0) {
        const held = holdings.find(x => x.symbol === sym);
        const ex = extra.find(x => x.symbol === sym);
        kept.push({
          symbol: sym,
          closes: h.closes,
          price: h.price,
          currency: h.currency ?? held?.currency ?? ex?.currency ?? 'USD',
          asset_class: ex?.asset_class ?? 'equity',
          label: ex?.label ?? held?.name,
        });
      }
    });

    if (kept.length < 2) {
      return new Response(JSON.stringify({ error: 'insufficient_history' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const symbols = kept.map(k => k.symbol);
    const priceMap = Object.fromEntries(kept.map(k => [k.symbol, k.price]));
    const currencyMap = Object.fromEntries(kept.map(k => [k.symbol, k.currency]));
    const classMap = Object.fromEntries(kept.map(k => [k.symbol, k.asset_class]));
    const labelMap = Object.fromEntries(kept.map(k => [k.symbol, k.label ?? '']));

    const returns = returnsFromCloses(kept.map(k => k.closes));
    if (!returns.length) {
      return new Response(JSON.stringify({ error: 'returns_unavailable' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Current weights from holdings
    const totalHoldings = holdings.reduce((s, h) => s + h.shares * (priceMap[h.symbol] ?? h.current_price ?? h.avg_price), 0);
    const totalValue = totalHoldings + cash;
    const currentBook = holdings.map(h => ({
      symbol: h.symbol,
      shares: h.shares,
      price: priceMap[h.symbol] ?? h.current_price ?? h.avg_price,
      currency: h.currency ?? currencyMap[h.symbol] ?? 'USD',
      asset_class: 'equity',
      symbol_label: h.name,
    }));
    const currentWeights: Record<string, number> = {};
    for (const c of currentBook) currentWeights[c.symbol] = (c.shares * c.price) / Math.max(1, totalValue);

    // Run all strategies in parallel-style (synchronous compute, but mapped)
    const c = cov(returns);
    const runs: { name: string; label: string; family: StrategyResult['family']; w: number[]; rationale: string }[] = [
      { name: 'mvo', label: 'Mean-Variance', family: 'return', w: meanVariance(returns), rationale: 'Long-only mean-variance optimization (projected-gradient) maximizing risk-adjusted return.' },
      { name: 'risk_parity', label: 'Risk Parity', family: 'risk', w: riskParity(c), rationale: 'Inverse-volatility weighting so each asset contributes equally to total portfolio risk.' },
      { name: 'hrp', label: 'Hierarchical Risk Parity', family: 'diversification', w: hrp(c), rationale: 'HRP recursive bisection on the covariance ordering — robust to correlated assets.' },
      { name: 'min_var', label: 'Min-Variance', family: 'risk', w: minVariance(returns), rationale: 'Minimises portfolio variance subject to long-only fully-invested constraint.' },
      { name: 'momentum', label: 'Momentum Tilt', family: 'tilt', w: momentum(returns), rationale: 'Tilts toward assets with positive 60-day mean returns.' },
      { name: 'low_vol', label: 'Low-Volatility Tilt', family: 'tilt', w: lowVolTilt(returns), rationale: 'Tilts toward assets with the lowest realised volatility.' },
      { name: 'equal_weight', label: 'Equal Weight', family: 'diversification', w: Array(symbols.length).fill(1 / symbols.length), rationale: 'Naive 1/N baseline — strong out-of-sample benchmark.' },
    ];

    const strategies: StrategyResult[] = runs.map(r => {
      const wmap = buildWeightMap(symbols, r.w);
      const stats = portfolioStats(r.w, returns);
      const turnover = turnoverVs(currentWeights, wmap);
      const fit = suitabilityFit(stats, riskProfile);
      const score = scoreStrategy(stats, turnover, fit);
      return {
        name: r.name,
        label: r.label,
        family: r.family,
        weights: wmap,
        stats: { ann_return: stats.ann_return, ann_vol: stats.ann_vol, sharpe: stats.sharpe, max_dd: stats.max_dd },
        turnover_pct: turnover,
        suitability_fit: fit,
        score,
        rationale: r.rationale,
      };
    }).sort((a, b) => b.score - a.score);

    const winner = strategies[0];
    const blended = blendTop(strategies, 3);

    // Generate order plan from blended consensus
    const orders = generateOrders(currentBook, blended, priceMap, currencyMap, classMap, labelMap, totalValue, gating);
    const ordersWinner = generateOrders(currentBook, winner.weights, priceMap, currencyMap, classMap, labelMap, totalValue, gating);

    // Persist if requested and we have an auth header
    let runId: string | null = null;
    if (persist && authHeader) {
      try {
        const url = Deno.env.get('SUPABASE_URL')!;
        const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
        const headers = { apikey: anon, Authorization: authHeader, 'Content-Type': 'application/json', Prefer: 'return=representation' };
        // Get user id from auth
        const uRes = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: authHeader } });
        const u = await uRes.json();
        const userId = u?.id;
        if (userId) {
          const runRes = await fetch(`${url}/rest/v1/advisor_runs`, {
            method: 'POST', headers, body: JSON.stringify({
              user_id: userId,
              portfolio_id: portfolioId ?? null,
              base_currency: baseCurrency,
              total_value: totalValue,
              cash_available: cash,
              risk_profile: riskProfile,
              suitability_summary: gating.suitability_completed ? `Profile complete (SRI ${gating.risk_level ?? '?'})` : 'Profile incomplete',
              gating: gating as unknown as Record<string, unknown>,
              strategies: strategies as unknown as Record<string, unknown>[],
              winner_strategy: winner.name,
              blended_weights: Object.entries(blended).map(([symbol, weight]) => ({ symbol, weight })),
              picked_basis: 'blended',
            }),
          });
          const runRow = (await runRes.json())?.[0];
          runId = runRow?.id ?? null;
          if (runId && orders.length) {
            await fetch(`${url}/rest/v1/advisor_orders`, {
              method: 'POST', headers, body: JSON.stringify(orders.map(o => ({ ...o, run_id: runId, user_id: userId }))),
            });
          }
        }
      } catch (e) {
        console.error('persist failed', e);
      }
    }

    return new Response(JSON.stringify({
      run_id: runId,
      base_currency: baseCurrency,
      total_value: totalValue,
      cash_available: cash,
      gating,
      strategies,
      winner: winner.name,
      blended_weights: blended,
      orders_blended: orders,
      orders_winner: ordersWinner,
      symbols,
      prices: priceMap,
      currencies: currencyMap,
      classes: classMap,
      labels: labelMap,
      current_weights: currentWeights,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});