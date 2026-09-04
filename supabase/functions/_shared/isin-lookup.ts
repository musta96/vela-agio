// =====================================================================
// Symbol → ISIN resolution (the reverse of isin-resolver.ts).
//
// Yahoo never publishes ISINs, but every European investor identifies a
// fund or ETF by its ISIN. We resolve it best-effort:
//   1. the curated instrument master (instant, authoritative)
//   2. FT Markets search + tearsheet (global ETF / fund / equity coverage)
// Results are memoised per isolate; callers cache them alongside the
// profile payload. A miss simply returns null — never throws.
// =====================================================================

import { CURATED } from "./instrument-master.ts";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const ISIN_RE = /\b[A-Z]{2}[A-Z0-9]{9}[0-9]\b/;
const memo = new Map<string, string | null>();

async function get(url: string, ms = 9000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Best-effort ISIN for a listed symbol (`SWDA.MI`, `VWCE.DE`, `SPY`…). */
export async function lookupIsin(symbol: string): Promise<string | null> {
  const sym = (symbol || "").trim().toUpperCase();
  if (!sym) return null;
  if (memo.has(sym)) return memo.get(sym)!;

  const curated = CURATED[sym]?.isin;
  if (curated) {
    memo.set(sym, curated);
    return curated;
  }

  let out: string | null = null;
  const base = sym.split(".")[0];
  if (base && !/^0P/i.test(base)) {
    const searched = await get(
      `https://markets.ft.com/data/searchapi/searchsecurities?query=${encodeURIComponent(base)}`,
    );
    if (searched) {
      try {
        const j = JSON.parse(searched);
        const rows: Array<{ url?: string; symbol?: string; assetClass?: string }> =
          j?.data?.security ?? [];
        const wanted = new Set(["ETFS", "FUNDS", "EQUITIES", "ETF", "FUND"]);
        const candidates = rows
          .filter((r) => r?.url && (!r.assetClass || wanted.has(String(r.assetClass).toUpperCase())))
          .filter((r) => String(r.symbol || "").split(":")[0].toUpperCase() === base)
          .slice(0, 2);
        for (const c of candidates) {
          const path = String(c.url).replace(/^~/, "");
          const html = await get(`https://markets.ft.com/data${path}`);
          const m = html?.match(new RegExp(`ISIN[^A-Za-z0-9]{0,40}(${ISIN_RE.source})`, "i"))
            ?? html?.match(ISIN_RE);
          if (m) { out = (m[1] ?? m[0]).toUpperCase(); break; }
        }
      } catch { /* ignore */ }
    }
  }

  memo.set(sym, out);
  return out;
}
