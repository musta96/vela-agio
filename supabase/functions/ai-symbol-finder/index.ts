import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { resolveAIConfig } from '../_shared/ai-provider.ts';
import { resolveAiAccess, aiDeniedResponse } from '../_shared/ai-access.ts';
import { isAiOptedOut, aiOptOutResponse } from '../_shared/ai-opt-out.ts';

/**
 * AI-powered fuzzy symbol resolver.
 * Takes a natural-language description ("Invesco blockchain ETF on Milan",
 * "Palantir Milano listing", "10y BTP", "Tesla on Frankfurt") and returns
 * candidate Yahoo Finance tickers, then validates each one against Yahoo
 * search so we only return symbols that actually exist.
 *
 * Response: { candidates: [{ symbol, name, exchange, currency, confidence, reason }] }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const __aiAccess = await resolveAiAccess(req.headers.get('Authorization'));
  if (!__aiAccess.allowed) return aiDeniedResponse(__aiAccess, corsHeaders);
  try {
    if (await isAiOptedOut(req.headers.get('Authorization'))) return aiOptOutResponse(corsHeaders);
    const { query, lang } = await req.json();
    const q = String(query ?? '').trim();
    if (!q) return new Response(JSON.stringify({ candidates: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const cfg = await resolveAIConfig(req.headers.get('Authorization'));
    const sys = `You resolve fuzzy financial-instrument descriptions to Yahoo Finance tickers.
Yahoo uses suffixes for non-US listings: .MI Milan, .DE Xetra, .F Frankfurt, .PA Paris, .AS Amsterdam,
.BR Brussels, .MC Madrid, .LS Lisbon, .L London, .SW Swiss, .HK Hong Kong, .T Tokyo, .TO Toronto,
.AX ASX, .SS Shanghai, .SZ Shenzhen, .NS NSE India, .SA São Paulo, .MX Mexico. US listings have no suffix.
ETFs on Milan often start with a digit prefix (e.g. 1PLTR.MI, BCHN.MI).
Crypto uses -USD (e.g. BTC-USD).
Return STRICT JSON only, no prose:
{"candidates":[{"symbol":"BCHN.MI","name":"Invesco CoinShares Global Blockchain UCITS ETF","exchange":"Milan","currency":"EUR","confidence":0.9,"reason":"primary Milan listing"}]}
Return 1-5 candidates, ordered most-likely first. If unsure, still propose your best guess with lower confidence.
Never invent obviously wrong tickers.`;
    const userMsg = `Resolve: "${q}"${lang === 'it' ? ' (user language: Italian)' : ''}`;

    const r = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST',
      headers: cfg.headers,
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: userMsg }],
        response_format: { type: 'json_object' },
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: 'Rate limit' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (r.status === 402) return new Response(JSON.stringify({ error: cfg.source === 'user' ? 'Your selected AI provider rejected the request because its quota or billing is unavailable. Check that provider account, or switch provider in Settings > Connections.' : 'Lovable AI credits are unavailable. View Plans & billing, or add your own API key in Settings > Connections.' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!r.ok) return new Response(JSON.stringify({ error: `AI ${r.status}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const j = await r.json();
    const raw = j?.choices?.[0]?.message?.content ?? '{}';
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
    const proposals: any[] = Array.isArray(parsed?.candidates) ? parsed.candidates.slice(0, 5) : [];

    // Validate each proposed symbol against Yahoo search so we don't return ghosts.
    const validated = await Promise.all(proposals.map(async (p) => {
      const sym = String(p?.symbol ?? '').trim();
      if (!sym) return null;
      try {
        const yr = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&quotesCount=5`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!yr.ok) return { ...p, verified: false };
        const yj = await yr.json();
        const match = (yj?.quotes ?? []).find((it: any) => (it?.symbol ?? '').toUpperCase() === sym.toUpperCase());
        if (match) {
          return {
            symbol: match.symbol,
            name: match.shortname || match.longname || p.name || match.symbol,
            exchange: match.exchDisp || p.exchange || '',
            type: match.quoteType || '',
            currency: p.currency || inferCcy(match.symbol),
            confidence: p.confidence ?? 0.6,
            reason: p.reason ?? '',
            verified: true,
          };
        }
        return { ...p, verified: false };
      } catch { return { ...p, verified: false }; }
    }));

    const candidates = validated.filter(Boolean).sort((a: any, b: any) => Number(b.verified) - Number(a.verified) || (b.confidence ?? 0) - (a.confidence ?? 0));
    return new Response(JSON.stringify({ candidates }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), candidates: [] }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

function inferCcy(symbol: string): string {
  const s = (symbol || '').toUpperCase();
  if (/\.(MI|DE|PA|AS|BR|MC|LS|VI|HE|IR|F)$/.test(s)) return 'EUR';
  if (s.endsWith('.L') || s.endsWith('.IL')) return 'GBP';
  if (s.endsWith('.SW')) return 'CHF';
  if (s.endsWith('.HK')) return 'HKD';
  if (s.endsWith('.T')) return 'JPY';
  if (s.endsWith('.TO') || s.endsWith('.V')) return 'CAD';
  if (s.endsWith('.AX')) return 'AUD';
  if (s.endsWith('.SS') || s.endsWith('.SZ')) return 'CNY';
  if (s.endsWith('.NS') || s.endsWith('.BO')) return 'INR';
  return 'USD';
}