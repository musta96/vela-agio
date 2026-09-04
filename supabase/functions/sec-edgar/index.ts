import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { secFullText } from '../_shared/official-sources.ts';

// Free SEC EDGAR JSON API. Maps ticker -> CIK -> recent filings.
const UA = 'FTSE MIB Analytics research@ftse-mib-analytics.app';

let tickerMap: Record<string, string> | null = null;
async function getCik(symbol: string): Promise<string | null> {
  if (!tickerMap) {
    const r = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': UA } });
    if (!r.ok) return null;
    const j = await r.json();
    tickerMap = {};
    for (const k of Object.keys(j)) {
      const row = j[k];
      tickerMap[row.ticker.toUpperCase()] = String(row.cik_str).padStart(10, '0');
    }
  }
  return tickerMap[symbol.toUpperCase()] ?? null;
}

function pick(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return null;
  const inner = m[1];
  const v = inner.match(/<value>([\s\S]*?)<\/value>/i);
  return (v ? v[1] : inner).trim();
}
function pickAll(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

async function parseForm4(cik: string, accession: string): Promise<any | null> {
  const accClean = accession.replace(/-/g, '');
  const idxUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=4`;
  // Fetch the filing index JSON to find the XML doc
  const base = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${accClean}`;
  try {
    const idx = await fetch(`${base}/index.json`, { headers: { 'User-Agent': UA } });
    if (!idx.ok) return null;
    const idxJson = await idx.json();
    const items: any[] = idxJson?.directory?.item ?? [];
    const xmlFile = items.find((i) => /\.xml$/i.test(i.name) && !/^primary_doc\.xml$/i.test(i.name) === false || /form4/i.test(i.name) || /^wf-form4/i.test(i.name) || /^edgardoc/i.test(i.name))
      ?? items.find((i) => /\.xml$/i.test(i.name));
    if (!xmlFile) return null;
    const xr = await fetch(`${base}/${xmlFile.name}`, { headers: { 'User-Agent': UA } });
    if (!xr.ok) return null;
    const xml = await xr.text();

    const ownerName = pick(xml, 'rptOwnerName') ?? '';
    const isDirector = pick(xml, 'isDirector') === '1' || pick(xml, 'isDirector')?.toLowerCase() === 'true';
    const isOfficer = pick(xml, 'isOfficer') === '1' || pick(xml, 'isOfficer')?.toLowerCase() === 'true';
    const isTenPct = pick(xml, 'isTenPercentOwner') === '1' || pick(xml, 'isTenPercentOwner')?.toLowerCase() === 'true';
    const officerTitle = pick(xml, 'officerTitle') ?? '';
    const role = officerTitle || (isDirector ? 'Director' : isTenPct ? '10% Owner' : isOfficer ? 'Officer' : 'Insider');

    const txBlocks = pickAll(xml, 'nonDerivativeTransaction');
    const transactions = txBlocks.map((b) => {
      const date = pick(b, 'transactionDate') ?? '';
      const code = pick(b, 'transactionCode') ?? '';
      const shares = parseFloat(pick(b, 'transactionShares') ?? '0') || 0;
      const price = parseFloat(pick(b, 'transactionPricePerShare') ?? '0') || 0;
      const ad = pick(b, 'transactionAcquiredDisposedCode') ?? '';
      return { date, code, shares, price, acquired: ad === 'A', value: shares * price };
    }).filter((t) => t.date && t.shares > 0);

    return { ownerName, role, isDirector, isOfficer, isTenPct, transactions };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { symbol, kind = 'filings' } = await req.json();
    const cik = await getCik(symbol);
    if (!cik) {
      // No ticker-to-CIK match (foreign private issuers, funds, share classes).
      // EDGAR full-text search still finds their filings by name/symbol.
      const wantInsider = kind === 'insider' || kind === 'insider_tx';
      const found = wantInsider ? [] : await secFullText(String(symbol ?? ''), {
        forms: ['10-K', '10-Q', '8-K', '20-F', '6-K', 'N-CSR', 'N-PORT-P', '497K'], limit: 25,
      });
      return new Response(JSON.stringify({
        items: found.map((d) => ({ form: d.title.split(' — ')[0], date: d.published, url: d.url, accession: null, doc: null })),
        note: found.length
          ? 'Matched through EDGAR full-text search (no direct ticker mapping).'
          : 'No filings on SEC EDGAR for this instrument (likely a non-US listing that does not file with the SEC).',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const sub = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: { 'User-Agent': UA } });
    if (!sub.ok) throw new Error(`EDGAR ${sub.status}`);
    const data = await sub.json();
    const recent = data?.filings?.recent ?? {};
    const forms: string[] = recent.form ?? [];
    const dates: string[] = recent.filingDate ?? [];
    const accs: string[] = recent.accessionNumber ?? [];
    const docs: string[] = recent.primaryDocument ?? [];
    const wantInsider = kind === 'insider' || kind === 'insider_tx';
    const items = forms.map((f, i) => ({
      form: f, date: dates[i], accession: accs[i], doc: docs[i],
      url: `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${accs[i]?.replace(/-/g, '')}/${docs[i]}`,
    }))
    .filter(x => wantInsider ? ['3', '4', '5'].includes(x.form) : ['10-K', '10-Q', '8-K', '20-F', '6-K', 'DEF 14A', '13F-HR'].includes(x.form))
    .slice(0, kind === 'insider_tx' ? 60 : 25);

    if (kind === 'insider_tx') {
      // Parse Form 4 XML transactions in parallel (bounded)
      const form4s = items.filter((i) => i.form === '4');
      const parsed = await Promise.all(form4s.map((i) => parseForm4(cik, i.accession).then((p) => ({ ...i, parsed: p }))));
      const transactions: any[] = [];
      for (const f of parsed) {
        if (!f.parsed) continue;
        for (const t of f.parsed.transactions) {
          transactions.push({
            filedAt: f.date,
            accession: f.accession,
            url: f.url,
            insider: f.parsed.ownerName,
            role: f.parsed.role,
            isDirector: f.parsed.isDirector,
            isOfficer: f.parsed.isOfficer,
            isTenPct: f.parsed.isTenPct,
            ...t,
          });
        }
      }
      transactions.sort((a, b) => (a.date < b.date ? 1 : -1));
      return new Response(JSON.stringify({ cik, name: data.name, transactions }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ cik, name: data.name, items }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});