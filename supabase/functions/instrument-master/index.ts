import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { CURATED, resolveInstrument, type InstrumentRecord } from '../_shared/instrument-master.ts';

// POST { symbols: string[] } | GET ?symbols=A,B  -> instrument master records
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    let symbols: string[] = [];
    if (req.method === 'GET') {
      const u = new URL(req.url);
      symbols = (u.searchParams.get('symbols') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      const body = await req.json().catch(() => ({}));
      symbols = Array.isArray(body.symbols) ? body.symbols.map((s: unknown) => String(s).trim()).filter(Boolean) : [];
    }
    if (!symbols.length) {
      return json({ curated: Object.values(CURATED), count: Object.keys(CURATED).length });
    }
    const records = await Promise.all(symbols.slice(0, 25).map(async (s) => {
      const rec = await resolveInstrument(s);
      return rec ?? { symbol: s.toUpperCase(), name: s.toUpperCase(), source: 'live', notes: 'Instrument not found.' } as InstrumentRecord;
    }));
    const gaps = records.filter((r) => r.source === 'live').map((r) => r.symbol);
    return json({
      records,
      unverified: gaps,
      note: gaps.length
        ? 'Records marked source:"live" lack verified ISIN/domicile/TER/KID data — state this uncertainty instead of guessing.'
        : 'All records verified from the curated instrument master.',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'lookup failed';
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
