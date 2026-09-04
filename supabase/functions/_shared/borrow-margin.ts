// =====================================================================
// borrow-margin — REAL stock-borrow and margin data, free sources only.
//
//  • Stock borrow: Interactive Brokers publishes its shortable-shares and
//    indicative borrow-fee files publicly (ftp3.interactivebrokers.com/
//    shortstock/<country>.txt). We parse the row for the ticker and return
//    the fee rate (annual %), available shares and rebate.
//  • Margin: statutory / exchange rules — Reg T (US), ESMA CFD & MiFID
//    haircuts (EU), plus exchange initial margin for the main futures.
//
// A paid vendor (S3 Partners / Orbisa / IBKR API) can be plugged in later
// through the same interface — see `_shared/data-entitlements.ts`.
// =====================================================================

export interface BorrowQuote {
  symbol: string;
  feeRate: number | null;       // annual borrow cost, decimal (0.0325 = 3.25%)
  rebateRate: number | null;
  available: number | null;     // shortable shares
  hardToBorrow: boolean;
  currency?: string;
  asOf: string;
  source: 'ibkr_public' | 'estimate';
  note?: string;
}

export interface MarginProfile {
  symbol: string;
  regime: string;               // "Reg T", "ESMA/MiFID", ...
  initialLongPct: number;       // fraction of notional posted at entry
  maintenanceLongPct: number;
  initialShortPct: number;
  maintenanceShortPct: number;
  notes: string[];
  source: string;
}

const IBKR_FILES: Record<string, string> = {
  US: 'usa', CA: 'canada', GB: 'britain', IT: 'italy', DE: 'germany', FR: 'france',
  NL: 'holland', ES: 'spain', BE: 'belgium', CH: 'swiss', AT: 'austria', SE: 'sweden',
  NO: 'norway', DK: 'denmark', FI: 'finland', PT: 'portugal', AU: 'australia',
  JP: 'japan', HK: 'hongkong', SG: 'singapore', IN: 'india', MX: 'mexico', ZA: 'southafrica',
};

const CACHE = new Map<string, { rows: Map<string, string[]>; at: number }>();
const TTL = 30 * 60 * 1000;

async function loadFile(country: string): Promise<Map<string, string[]>> {
  const file = IBKR_FILES[country] ?? 'usa';
  const hit = CACHE.get(file);
  if (hit && Date.now() - hit.at < TTL) return hit.rows;
  const rows = new Map<string, string[]>();
  try {
    const r = await fetch(`https://ftp3.interactivebrokers.com/shortstock/${file}.txt`);
    if (r.ok) {
      const text = await r.text();
      for (const line of text.split('\n')) {
        const cols = line.split('|');
        if (cols.length < 8) continue;
        rows.set(cols[0].trim().toUpperCase(), cols);
      }
    }
  } catch { /* offline -> estimate */ }
  CACHE.set(file, { rows, at: Date.now() });
  return rows;
}

function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(String(v).replace(/[>,%]/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

export async function getBorrowQuote(symbol: string, country = 'US'): Promise<BorrowQuote> {
  const base = symbol.split('.')[0].toUpperCase();
  const rows = await loadFile(country);
  const row = rows.get(base);
  const asOf = new Date().toISOString().slice(0, 10);
  if (row) {
    // IBKR layout: SYM|CUR|NAME|CON|ISIN|REBATERATE|FEERATE|AVAILABLE
    const fee = num(row[6]);
    const rebate = num(row[5]);
    const avail = num(row[7]);
    return {
      symbol: base,
      feeRate: fee != null ? fee / 100 : null,
      rebateRate: rebate != null ? rebate / 100 : null,
      available: avail,
      hardToBorrow: (fee ?? 0) > 5 || (avail ?? 0) < 50_000,
      currency: row[1]?.trim(),
      asOf,
      source: 'ibkr_public',
    };
  }
  return {
    symbol: base, feeRate: null, rebateRate: null, available: null, hardToBorrow: false,
    asOf, source: 'estimate',
    note: 'Not present in the public IBKR shortable file for this market — no real borrow rate available; simulations must flag this as an assumption.',
  };
}

export function getMarginProfile(symbol: string, country = 'US', assetClass = 'equity'): MarginProfile {
  if (assetClass === 'future') {
    return {
      symbol, regime: 'Exchange SPAN (CME/Eurex)',
      initialLongPct: 0.08, maintenanceLongPct: 0.07, initialShortPct: 0.08, maintenanceShortPct: 0.07,
      notes: [
        'Futures margin is a per-contract SPAN amount set by the exchange and revised frequently — the % shown is an indicative share of notional.',
        'Daily variation margin is cash-settled; losses are debited the same day.',
      ],
      source: 'CME/Eurex published margin methodology',
    };
  }
  if (country === 'US') {
    return {
      symbol, regime: 'Reg T (Federal Reserve) + FINRA 4210',
      initialLongPct: 0.5, maintenanceLongPct: 0.25, initialShortPct: 1.5, maintenanceShortPct: 0.3,
      notes: [
        'Reg T initial margin 50% of long market value; FINRA maintenance minimum 25%.',
        'Shorts: 150% of market value must be on deposit (proceeds + 50%); maintenance 30% (higher for low-priced stock).',
        'Portfolio-margin accounts use risk-based requirements and can be materially lower.',
      ],
      source: 'Federal Reserve Reg T / FINRA Rule 4210',
    };
  }
  return {
    symbol, regime: 'EU/UK broker haircut (MiFID II)',
    initialLongPct: 0.5, maintenanceLongPct: 0.3, initialShortPct: 1.5, maintenanceShortPct: 0.35,
    notes: [
      'Non-US brokers set their own haircuts within MiFID II rules; values shown are typical retail levels.',
      'Short selling of EU shares is subject to SSR net-short position notification thresholds (0.1% and each 0.1% thereafter).',
    ],
    source: 'MiFID II / SSR (EU 236/2012) — typical broker terms',
  };
}
