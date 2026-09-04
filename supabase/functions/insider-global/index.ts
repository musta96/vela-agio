import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { marketForSymbol, isUsSymbol } from '../_shared/market-registry.ts';
import { resolveAIConfig, chatComplete } from '../_shared/ai-provider.ts';

// =====================================================================
// insider-global — insider / PDMR transactions for ANY market.
//
//  • US            -> SEC EDGAR Forms 3/4/5 (structured, parsed XML)
//  • Everywhere    -> official regulator / exchange disclosure feeds
//                     (MAR Art.19, SEDI, EDINET, DART, HKEXnews, SEBI,
//                      ASX 3Y, JSE SENS, Tadawul, B3/CVM, …) retrieved via
//                     the `web-research` engine and structured by the AI
//                     extractor, with the source URL kept on every row.
// =====================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

async function callEdge(fn: string, body: unknown, authHeader: string | null) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: authHeader ?? `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return null; }
}

interface Tx {
  filedAt: string; date: string; code: string; shares: number; price: number;
  value: number; acquired: boolean; insider: string; role: string; url: string;
  accession?: string; currency?: string; note?: string;
}

/** Ask the research engine for the official disclosure pages. */
async function researchDisclosures(symbol: string, companyName: string, authHeader: string | null) {
  const mkt = marketForSymbol(symbol);
  const base = companyName || symbol.split('.')[0];
  const queries = [
    `${base} ${mkt.searchHints[0]} ${new Date().getFullYear()}`,
    `${base} ${mkt.regulator} insider transactions disclosure`,
  ];
  const out: Array<{ title: string; url: string; excerpt?: string; domain?: string }> = [];
  for (const q of queries) {
    const res = await callEdge('web-research', {
      query: q,
      lane: 'company',
      max_results: 5,
      fetch_pages: true,
      prefer_domains: mkt.sources,
    }, authHeader);
    const hits = res?.results ?? res?.hits ?? [];
    for (const h of hits) if (h?.url) out.push(h);
    if (out.length >= 6) break;
  }
  // Official sources first
  return out
    .sort((a, b) => Number(mkt.sources.some((d) => (b.domain ?? b.url).includes(d))) -
      Number(mkt.sources.some((d) => (a.domain ?? a.url).includes(d))))
    .slice(0, 8);
}

async function extractTransactions(
  cfg: Awaited<ReturnType<typeof resolveAIConfig>>,
  symbol: string,
  docs: Array<{ title: string; url: string; excerpt?: string }>,
): Promise<Tx[]> {
  const mkt = marketForSymbol(symbol);
  const corpus = docs.map((d, i) => `[[${i + 1}]] ${d.title}\nURL: ${d.url}\n${(d.excerpt ?? '').slice(0, 3500)}`).join('\n\n');
  if (!corpus.trim()) return [];
  const sys = `You extract insider / PDMR ("managers' transactions") disclosures from official filings.
Market: ${mkt.market} (${mkt.country}) — regulator ${mkt.regulator}, regime ${mkt.regime}.
Return STRICT JSON: {"transactions":[{"date":"YYYY-MM-DD","filedAt":"YYYY-MM-DD","insider":"name","role":"role","code":"P|S|A|G|O","acquired":true,"shares":123,"price":10.5,"currency":"EUR","url":"source url","note":"short context"}]}
Rules: only include transactions you can actually read in the text. Never invent names, dates, sizes or prices. If a field is unknown use null. Use code "P" for purchases/acquisitions, "S" for sales/disposals, "A" for awards/grants, "O" otherwise. Return {"transactions":[]} when the sources contain no actual transaction data.`;
  try {
    const r = await chatComplete(cfg, {
      messages: [{ role: 'system', content: sys }, { role: 'user', content: `Ticker ${symbol}. Sources:\n\n${corpus}` }],
      temperature: 0,
      response_format: { type: 'json_object' },
    });
    if (!r.ok) return [];
    const j = await r.json();
    const raw = j?.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw.replace(/^```json\s*|```$/g, ''));
    const list: Tx[] = (parsed.transactions ?? []).map((t: Record<string, unknown>) => {
      const shares = Number(t.shares) || 0;
      const price = Number(t.price) || 0;
      const code = String(t.code ?? 'O').toUpperCase();
      return {
        date: String(t.date ?? '').slice(0, 10),
        filedAt: String(t.filedAt ?? t.date ?? '').slice(0, 10),
        insider: String(t.insider ?? 'Undisclosed'),
        role: String(t.role ?? 'Insider'),
        code,
        shares,
        price,
        value: shares * price,
        acquired: t.acquired === true || code === 'P' || code === 'A',
        currency: t.currency ? String(t.currency) : mkt.currency,
        url: String(t.url ?? docs[0]?.url ?? ''),
        note: t.note ? String(t.note) : undefined,
      } as Tx;
    }).filter((t: Tx) => t.date && t.shares > 0);
    list.sort((a, b) => (a.date < b.date ? 1 : -1));
    return list.slice(0, 80);
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    const body = await req.json().catch(() => ({}));
    const symbol = String(body.symbol ?? '').trim().toUpperCase();
    if (!symbol) return json({ error: 'symbol required' }, 400);
    const companyName = String(body.name ?? '');
    const mkt = marketForSymbol(symbol);

    // ---- 1) US: structured SEC path -------------------------------
    if (isUsSymbol(symbol)) {
      const sec = await callEdge('sec-edgar', { symbol, kind: 'insider_tx' }, authHeader);
      const txs: Tx[] = (sec?.transactions ?? []).map((t: Tx) => ({ ...t, currency: 'USD' }));
      if (txs.length) {
        return json({
          symbol, name: sec?.name ?? companyName, market: mkt, method: 'regulator_structured',
          coverage: 'full', transactions: txs, sources: [{ title: 'SEC EDGAR', url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${sec?.cik ?? symbol}&type=4` }],
        });
      }
    }

    // ---- 2) Any market: official disclosures + AI extraction -------
    const docs = await researchDisclosures(symbol, companyName, authHeader);
    const cfg = await resolveAIConfig(authHeader);
    const txs = await extractTransactions(cfg, symbol, docs as Array<{ title: string; url: string; excerpt?: string }>);

    return json({
      symbol,
      name: companyName,
      market: mkt,
      method: 'regulator_research',
      coverage: txs.length ? 'partial' : 'none',
      transactions: txs,
      sources: docs.map((d) => ({ title: d.title, url: d.url })),
      note: txs.length
        ? `Extracted from ${mkt.regulator} / exchange disclosures under ${mkt.regime}. Verify each row against its source link before acting.`
        : `No machine-readable insider disclosures found for ${symbol} on ${mkt.regulator} sources. ${mkt.country === '??' ? 'This exchange is not yet mapped.' : `Check ${mkt.sources[0] ?? 'the local regulator'} directly.`}`,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'insider lookup failed' }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
