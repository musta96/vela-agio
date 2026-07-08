import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

/**
 * Fetch and parse the latest 13F-HR filing for a given CIK from SEC EDGAR.
 * The SEC requires a descriptive User-Agent on every request.
 */
const UA = 'Vela.ai Research (research@vela.ai)';

interface Holding {
  name: string;
  cusip: string;
  ticker?: string | null;
  value: number;         // reported in USD (SEC field is in thousands prior to 2022, dollars after)
  shares: number;
  putCall?: string | null;
  pct?: number;
}

const memo = new Map<string, { at: number; payload: unknown }>();
const TTL = 6 * 3600 * 1000; // 6h

function padCik(cik: string): string {
  const digits = cik.replace(/\D/g, '');
  return digits.padStart(10, '0');
}

async function edgarJson(url: string) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`EDGAR ${r.status} on ${url}`);
  return r.json();
}

async function edgarText(url: string) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/xml, text/html' } });
  if (!r.ok) throw new Error(`EDGAR ${r.status} on ${url}`);
  return r.text();
}

/**
 * Locate the most recent 13F-HR filing accession number and its info-table URL.
 */
async function findLatest13F(cikPadded: string) {
  const subs = await edgarJson(`https://data.sec.gov/submissions/CIK${cikPadded}.json`);
  const recent = subs?.filings?.recent;
  if (!recent?.form) throw new Error('No filings index');
  const forms: string[] = recent.form;
  const accessions: string[] = recent.accessionNumber;
  const dates: string[] = recent.filingDate;
  const primaryDocs: string[] = recent.primaryDocument;
  let idx = -1;
  for (let i = 0; i < forms.length; i++) {
    if (forms[i] === '13F-HR' || forms[i] === '13F-HR/A') { idx = i; break; }
  }
  if (idx < 0) throw new Error('No 13F-HR filing found for this CIK');
  const acc = accessions[idx];
  const accNoDash = acc.replace(/-/g, '');
  const base = `https://www.sec.gov/Archives/edgar/data/${parseInt(cikPadded, 10)}/${accNoDash}`;
  // Try to find the information-table xml via the filing index.
  const idxJson = await edgarJson(`${base}/index.json`);
  const items: any[] = idxJson?.directory?.item ?? [];
  const infoTable = items.find((it) => /informationtable\.xml$/i.test(it.name));
  return {
    accession: acc,
    filingDate: dates[idx],
    primaryDocument: primaryDocs[idx],
    infoTableUrl: infoTable ? `${base}/${infoTable.name}` : null,
    base,
    filerName: subs?.name ?? '',
  };
}

/** Very small XML parser for 13F info tables (no external deps). */
function parseInfoTable(xml: string): Holding[] {
  const holdings: Holding[] = [];
  const rowRe = /<(?:\w+:)?infoTable[^>]*>([\s\S]*?)<\/(?:\w+:)?infoTable>/gi;
  const tag = (block: string, name: string) => {
    const re = new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`, 'i');
    const m = block.match(re); return m ? m[1].trim() : '';
  };
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(xml)) !== null) {
    const b = m[1];
    const value = Number(tag(b, 'value').replace(/,/g, '')) || 0;
    const shares = Number(tag(b, 'sshPrnamt').replace(/,/g, '')) || 0;
    holdings.push({
      name: tag(b, 'nameOfIssuer'),
      cusip: tag(b, 'cusip'),
      value,
      shares,
      putCall: tag(b, 'putCall') || null,
    });
  }
  // SEC used to report value in $000 pre-2022; post-2022 in dollars. Heuristic:
  // if any single holding value < 1e6 sum treat as thousands.
  const total = holdings.reduce((s, h) => s + h.value, 0);
  if (total > 0 && total < 5e9 && holdings.length > 20) {
    for (const h of holdings) h.value *= 1000;
  }
  const grand = holdings.reduce((s, h) => s + h.value, 0);
  if (grand > 0) for (const h of holdings) h.pct = h.value / grand;
  return holdings.sort((a, b) => b.value - a.value);
}

/** Best-effort CUSIP → ticker via EDGAR full-text search (rate-limited). */
async function resolveCusips(cusips: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const c of cusips) {
    if (!c || c.length < 8) { out[c] = null; continue; }
    try {
      const j = await edgarJson(`https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(c)}%22&forms=10-K,10-Q&dateRange=custom&startdt=2022-01-01&enddt=${new Date().toISOString().slice(0, 10)}`);
      const hit = j?.hits?.hits?.[0];
      const t = hit?._source?.tickers?.[0] ?? null;
      out[c] = t ? String(t).toUpperCase() : null;
    } catch { out[c] = null; }
    await new Promise((r) => setTimeout(r, 120)); // SEC 10 req/s cap
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = String(body.action ?? 'holdings');

    if (action === 'resolve_cusips') {
      const cusips = Array.isArray(body.cusips) ? body.cusips.slice(0, 40) : [];
      const cacheKey = `resolve:${cusips.join(',')}`;
      const c = memo.get(cacheKey);
      if (c && Date.now() - c.at < TTL) {
        return new Response(JSON.stringify(c.payload), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const map = await resolveCusips(cusips);
      const payload = { map };
      memo.set(cacheKey, { at: Date.now(), payload });
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // holdings
    const cik = String(body.cik ?? '').trim();
    if (!cik) throw new Error('cik is required');
    const cikPadded = padCik(cik);
    const cacheKey = `holdings:${cikPadded}`;
    const cached = memo.get(cacheKey);
    if (cached && Date.now() - cached.at < TTL) {
      return new Response(JSON.stringify(cached.payload), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const meta = await findLatest13F(cikPadded);
    if (!meta.infoTableUrl) throw new Error('Information table not found in filing');
    const xml = await edgarText(meta.infoTableUrl);
    const holdings = parseInfoTable(xml);
    const totalValue = holdings.reduce((s, h) => s + h.value, 0);
    const payload = {
      cik: cikPadded,
      filerName: meta.filerName,
      accession: meta.accession,
      filingDate: meta.filingDate,
      totalValue,
      holdingsCount: holdings.length,
      holdings: holdings.slice(0, 100),
    };
    memo.set(cacheKey, { at: Date.now(), payload });
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'unknown' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});