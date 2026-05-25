import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { symbol, kind = 'filings' } = await req.json();
    const cik = await getCik(symbol);
    if (!cik) return new Response(JSON.stringify({ items: [], note: 'Ticker not found on SEC EDGAR (likely non-US listing).' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const sub = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: { 'User-Agent': UA } });
    if (!sub.ok) throw new Error(`EDGAR ${sub.status}`);
    const data = await sub.json();
    const recent = data?.filings?.recent ?? {};
    const forms: string[] = recent.form ?? [];
    const dates: string[] = recent.filingDate ?? [];
    const accs: string[] = recent.accessionNumber ?? [];
    const docs: string[] = recent.primaryDocument ?? [];
    const wantInsider = kind === 'insider';
    const items = forms.map((f, i) => ({
      form: f, date: dates[i], accession: accs[i], doc: docs[i],
      url: `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${accs[i]?.replace(/-/g, '')}/${docs[i]}`,
    }))
    .filter(x => wantInsider ? ['3', '4', '5'].includes(x.form) : ['10-K', '10-Q', '8-K', '20-F', '6-K', 'DEF 14A', '13F-HR'].includes(x.form))
    .slice(0, 25);
    return new Response(JSON.stringify({ cik, name: data.name, items }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});