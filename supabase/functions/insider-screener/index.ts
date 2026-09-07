import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { scoreInsiderTransactions, type InsiderSignal, type InsiderTx } from '../_shared/insider-signal.ts';
import { isUsSymbol } from '../_shared/market-registry.ts';

// =====================================================================
// insider-screener — ranks a universe by insider conviction so the user
// can see where insiders are buying (long candidates) and where they are
// dumping (short / avoid candidates).
//
// US names use the structured SEC Form 4 path; other markets go through
// insider-global (regulator disclosures + AI extraction) and are capped
// because that path is much slower.
// =====================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const UNIVERSES: Record<string, string[]> = {
  us_megacap: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'BRK-B', 'JPM', 'V', 'UNH', 'XOM', 'LLY', 'JNJ', 'WMT', 'PG', 'MA', 'HD', 'COST'],
  us_growth: ['PLTR', 'CRWD', 'SNOW', 'NET', 'DDOG', 'SHOP', 'ABNB', 'UBER', 'COIN', 'RBLX', 'SOFI', 'AFRM', 'ROKU', 'LCID', 'RIVN', 'DKNG'],
  us_value: ['T', 'VZ', 'PFE', 'CVX', 'KO', 'PEP', 'MRK', 'CSCO', 'IBM', 'GILD', 'MO', 'F', 'GM', 'C', 'WFC', 'BAC'],
  us_smallmid: ['ETSY', 'CHWY', 'PINS', 'SNAP', 'W', 'BYND', 'PTON', 'FUBO', 'OPEN', 'UPST', 'HOOD', 'LYFT', 'WBD', 'PARA', 'M', 'GPS'],
  europe: ['ENEL.MI', 'ISP.MI', 'UCG.MI', 'STLAM.MI', 'ENI.MI', 'ASML.AS', 'SAP.DE', 'SIE.DE', 'MC.PA', 'AIR.PA'],
};

async function edge(fn: string, body: unknown, auth: string | null) {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: auth ?? `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const t = await r.text();
    try { return JSON.parse(t); } catch { return null; }
  } catch { return null; }
}

interface CacheEntry { at: number; txs: InsiderTx[]; name: string }
const cache = new Map<string, CacheEntry>();
const TTL_MS = 6 * 60 * 60 * 1000;

async function fetchTxs(symbol: string, auth: string | null): Promise<CacheEntry> {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;

  let txs: InsiderTx[] = [];
  let name = '';
  if (isUsSymbol(symbol)) {
    const r = await edge('sec-edgar', { symbol, kind: 'insider_tx' }, auth);
    txs = (r?.transactions ?? []) as InsiderTx[];
    name = r?.name ?? '';
  } else {
    const r = await edge('insider-global', { symbol }, auth);
    txs = (r?.transactions ?? []) as InsiderTx[];
    name = r?.name ?? '';
  }
  const entry = { at: Date.now(), txs, name };
  cache.set(symbol, entry);
  return entry;
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

function rationale(symbol: string, s: InsiderSignal): string {
  if (!s.transactions) return 'No disclosed transactions in the window.';
  const money = (v: number) => Math.abs(Math.round(v)).toLocaleString();
  const awardNote = s.awards > 0 ? ` ${s.awards} filing${s.awards === 1 ? ' was' : 's were'} equity awards, which are compensation rather than conviction.` : '';
  if (s.score > 0) {
    return `${s.uniqueBuyers} insider${s.uniqueBuyers === 1 ? '' : 's'} bought ${money(s.buyValue)} against ${money(s.sellValue)} sold${s.cluster ? '; cluster buying (3+ insiders) is the historically informative pattern' : ''}. Last filing ${s.lastDate}.${awardNote}`;
  }
  if (s.score < 0) {
    return `Insiders sold ${money(s.sellValue)} against ${money(s.buyValue)} bought across ${s.uniqueSellers} seller${s.uniqueSellers === 1 ? '' : 's'}. Persistent selling by officers is a headwind, though it is often scheduled compensation. Last filing ${s.lastDate}.${awardNote}`;
  }
  return `Buying and selling roughly balance over ${s.lookbackDays} days.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization');
    const body = await req.json().catch(() => ({}));

    const universeKey = String(body.universe ?? 'us_megacap');
    const custom: string[] = Array.isArray(body.symbols)
      ? body.symbols.map((s: unknown) => String(s).toUpperCase().trim()).filter(Boolean)
      : [];
    const lookbackDays = Math.min(Math.max(Number(body.lookback_days ?? 90), 7), 365);
    const maxSymbols = Math.min(Math.max(Number(body.max_symbols ?? 20), 3), 40);

    let symbols = (custom.length ? custom : UNIVERSES[universeKey] ?? UNIVERSES.us_megacap).slice(0, maxSymbols);
    // Non-US names are far slower (research + AI extraction) — keep the batch small.
    const nonUs = symbols.filter((s) => !isUsSymbol(s));
    if (nonUs.length > 8) symbols = symbols.filter((s) => isUsSymbol(s) || nonUs.slice(0, 8).includes(s));

    const rows = await mapLimited(symbols, 5, async (symbol) => {
      const { txs, name } = await fetchTxs(symbol, auth);
      const signal = scoreInsiderTransactions(txs, lookbackDays);
      return {
        symbol,
        name,
        signal,
        rationale: rationale(symbol, signal),
        stance: signal.score >= 20 ? 'long_candidate' : signal.score <= -20 ? 'short_candidate' : 'no_edge',
      };
    });

    const covered = rows.filter((r) => r.signal.transactions > 0);
    const ranked = [...covered].sort((a, b) => b.signal.score - a.signal.score);

    return new Response(JSON.stringify({
      generated_at: new Date().toISOString(),
      universe: custom.length ? 'custom' : universeKey,
      lookback_days: lookbackDays,
      scanned: symbols.length,
      with_disclosures: covered.length,
      results: ranked,
      buy_candidates: ranked.filter((r) => r.signal.score >= 20).slice(0, 10),
      sell_candidates: [...ranked].reverse().filter((r) => r.signal.score <= -20).slice(0, 10),
      no_data: rows.filter((r) => r.signal.transactions === 0).map((r) => r.symbol),
      disclaimer: 'Insider filings are a lagging, noisy signal. Educational research output, not investment advice.',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'screen failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
