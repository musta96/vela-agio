// =====================================================================
// Instrument master — reference data needed to compare instruments
// rigorously (UCITS vs US-domiciled ETFs, tax status, cost, liquidity).
// Static curated records + a live Yahoo fallback for anything else.
// =====================================================================

export interface InstrumentRecord {
  symbol: string;
  name: string;
  isin?: string;
  exchange?: string;
  domicile?: string;          // IE, LU, US, IT ...
  tradingCurrency?: string;
  assetClass?: 'equity' | 'etf' | 'bond' | 'commodity' | 'crypto' | 'future' | 'fx';
  ter?: number;               // annual fee, decimal
  replication?: 'physical-full' | 'physical-sampled' | 'synthetic' | 'n/a';
  distribution?: 'accumulating' | 'distributing' | 'n/a';
  kidAvailable?: boolean;     // PRIIPs KID -> retail-tradable in the EU
  ucits?: boolean;
  fundSizeUsdM?: number;
  avgSpreadBps?: number;
  avgDailyVolume?: number;
  usSitusEstateTax?: boolean; // relevant for non-resident holders of US-situated assets
  notes?: string;
  source: 'curated' | 'live';
}

export const CURATED: Record<string, InstrumentRecord> = {
  'VWCE.DE': { symbol: 'VWCE.DE', name: 'Vanguard FTSE All-World UCITS ETF (Acc)', isin: 'IE00BK5BQT80', exchange: 'XETRA', domicile: 'IE', tradingCurrency: 'EUR', assetClass: 'etf', ter: 0.0022, replication: 'physical-sampled', distribution: 'accumulating', kidAvailable: true, ucits: true, fundSizeUsdM: 27000, avgSpreadBps: 6, usSitusEstateTax: false, source: 'curated' },
  'VWRL.AS': { symbol: 'VWRL.AS', name: 'Vanguard FTSE All-World UCITS ETF (Dist)', isin: 'IE00B3RBWM25', exchange: 'Euronext Amsterdam', domicile: 'IE', tradingCurrency: 'EUR', assetClass: 'etf', ter: 0.0022, replication: 'physical-sampled', distribution: 'distributing', kidAvailable: true, ucits: true, fundSizeUsdM: 12000, avgSpreadBps: 7, usSitusEstateTax: false, source: 'curated' },
  'SWDA.MI': { symbol: 'SWDA.MI', name: 'iShares Core MSCI World UCITS ETF (Acc)', isin: 'IE00B4L5Y983', exchange: 'Borsa Italiana', domicile: 'IE', tradingCurrency: 'EUR', assetClass: 'etf', ter: 0.002, replication: 'physical-sampled', distribution: 'accumulating', kidAvailable: true, ucits: true, fundSizeUsdM: 80000, avgSpreadBps: 5, usSitusEstateTax: false, source: 'curated' },
  'EIMI.MI': { symbol: 'EIMI.MI', name: 'iShares Core MSCI EM IMI UCITS ETF (Acc)', isin: 'IE00BKM4GZ66', exchange: 'Borsa Italiana', domicile: 'IE', tradingCurrency: 'EUR', assetClass: 'etf', ter: 0.0018, replication: 'physical-sampled', distribution: 'accumulating', kidAvailable: true, ucits: true, fundSizeUsdM: 21000, avgSpreadBps: 12, usSitusEstateTax: false, source: 'curated' },
  'XDWT.DE': { symbol: 'XDWT.DE', name: 'Xtrackers MSCI World Information Technology UCITS ETF', isin: 'IE00BM67HT60', exchange: 'XETRA', domicile: 'IE', tradingCurrency: 'EUR', assetClass: 'etf', ter: 0.0025, replication: 'synthetic', distribution: 'accumulating', kidAvailable: true, ucits: true, fundSizeUsdM: 4500, avgSpreadBps: 10, usSitusEstateTax: false, source: 'curated' },
  'IUIT.L': { symbol: 'IUIT.L', name: 'iShares S&P 500 Information Technology Sector UCITS ETF', isin: 'IE00B3WJKG14', exchange: 'LSE', domicile: 'IE', tradingCurrency: 'USD', assetClass: 'etf', ter: 0.0015, replication: 'physical-full', distribution: 'accumulating', kidAvailable: true, ucits: true, fundSizeUsdM: 10000, avgSpreadBps: 8, usSitusEstateTax: false, source: 'curated' },
  'AGGH.MI': { symbol: 'AGGH.MI', name: 'iShares Core Global Aggregate Bond UCITS ETF EUR-H (Acc)', isin: 'IE00BDBRDM35', exchange: 'Borsa Italiana', domicile: 'IE', tradingCurrency: 'EUR', assetClass: 'bond', ter: 0.001, replication: 'physical-sampled', distribution: 'accumulating', kidAvailable: true, ucits: true, fundSizeUsdM: 7000, avgSpreadBps: 9, usSitusEstateTax: false, source: 'curated' },
  'SGLD.MI': { symbol: 'SGLD.MI', name: 'Invesco Physical Gold ETC', isin: 'IE00B579F325', exchange: 'Borsa Italiana', domicile: 'IE', tradingCurrency: 'USD', assetClass: 'commodity', ter: 0.0012, replication: 'physical-full', distribution: 'n/a', kidAvailable: true, ucits: false, fundSizeUsdM: 16000, avgSpreadBps: 8, usSitusEstateTax: false, notes: 'ETC (debt security), not a UCITS fund.', source: 'curated' },
  VOO: { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', isin: 'US9229083632', exchange: 'NYSE Arca', domicile: 'US', tradingCurrency: 'USD', assetClass: 'etf', ter: 0.0003, replication: 'physical-full', distribution: 'distributing', kidAvailable: false, ucits: false, fundSizeUsdM: 1300000, avgSpreadBps: 1, usSitusEstateTax: true, notes: 'No PRIIPs KID: generally not retail-tradable in the EU. US-situs asset for estate-tax purposes.', source: 'curated' },
  SPY: { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', isin: 'US78462F1030', exchange: 'NYSE Arca', domicile: 'US', tradingCurrency: 'USD', assetClass: 'etf', ter: 0.000945, replication: 'physical-full', distribution: 'distributing', kidAvailable: false, ucits: false, fundSizeUsdM: 600000, avgSpreadBps: 1, usSitusEstateTax: true, source: 'curated' },
  QQQ: { symbol: 'QQQ', name: 'Invesco QQQ Trust', isin: 'US46090E1038', exchange: 'Nasdaq', domicile: 'US', tradingCurrency: 'USD', assetClass: 'etf', ter: 0.002, replication: 'physical-full', distribution: 'distributing', kidAvailable: false, ucits: false, fundSizeUsdM: 300000, avgSpreadBps: 1, usSitusEstateTax: true, source: 'curated' },
  'CSPX.MI': { symbol: 'CSPX.MI', name: 'iShares Core S&P 500 UCITS ETF (Acc)', isin: 'IE00B5BMR087', exchange: 'Borsa Italiana', domicile: 'IE', tradingCurrency: 'EUR', assetClass: 'etf', ter: 0.0007, replication: 'physical-full', distribution: 'accumulating', kidAvailable: true, ucits: true, fundSizeUsdM: 100000, avgSpreadBps: 4, usSitusEstateTax: false, notes: 'UCITS alternative to VOO/SPY for EU retail investors.', source: 'curated' },
  NVDA: { symbol: 'NVDA', name: 'NVIDIA Corporation', isin: 'US67066G1040', exchange: 'Nasdaq', domicile: 'US', tradingCurrency: 'USD', assetClass: 'equity', kidAvailable: true, usSitusEstateTax: true, avgSpreadBps: 1, source: 'curated' },
  ASML: { symbol: 'ASML', name: 'ASML Holding NV (ADR)', isin: 'USN070592100', exchange: 'Nasdaq', domicile: 'NL', tradingCurrency: 'USD', assetClass: 'equity', kidAvailable: true, usSitusEstateTax: true, avgSpreadBps: 2, notes: 'Local line ASML.AS avoids US-situs exposure.', source: 'curated' },
  'ASML.AS': { symbol: 'ASML.AS', name: 'ASML Holding NV', isin: 'NL0010273215', exchange: 'Euronext Amsterdam', domicile: 'NL', tradingCurrency: 'EUR', assetClass: 'equity', kidAvailable: true, usSitusEstateTax: false, avgSpreadBps: 3, source: 'curated' },
  'RACE.MI': { symbol: 'RACE.MI', name: 'Ferrari NV', isin: 'NL0011585146', exchange: 'Borsa Italiana', domicile: 'NL', tradingCurrency: 'EUR', assetClass: 'equity', kidAvailable: true, usSitusEstateTax: false, avgSpreadBps: 4, source: 'curated' },
  'ES=F': { symbol: 'ES=F', name: 'E-mini S&P 500 Future (CME)', exchange: 'CME', tradingCurrency: 'USD', assetClass: 'future', kidAvailable: true, notes: 'Contract size 50 x index. Quarterly roll; daily variation margin. See CME contract specs.', source: 'curated' },
  'GC=F': { symbol: 'GC=F', name: 'Gold Future (COMEX)', exchange: 'COMEX', tradingCurrency: 'USD', assetClass: 'future', notes: 'Contract size 100 troy oz. Monthly/bimonthly roll.', source: 'curated' },
  'EURUSD=X': { symbol: 'EURUSD=X', name: 'EUR/USD spot', assetClass: 'fx', tradingCurrency: 'USD', source: 'curated' },
};

/** Live fallback: enough reference data to flag what is unknown. */
export async function liveLookup(symbol: string): Promise<InstrumentRecord | null> {
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36';
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  for (const u of [url, `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`]) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA } });
      if (!r.ok) continue;
      const j = await r.json();
      const q = j?.quoteResponse?.result?.[0];
      if (!q) continue;
      const type = String(q.quoteType ?? '').toLowerCase();
      return {
        symbol: symbol.toUpperCase(),
        name: q.longName ?? q.shortName ?? symbol,
        exchange: q.fullExchangeName ?? q.exchange,
        tradingCurrency: q.currency,
        assetClass: type === 'etf' ? 'etf' : type === 'cryptocurrency' ? 'crypto'
          : type === 'future' ? 'future' : type === 'currency' ? 'fx' : 'equity',
        avgDailyVolume: q.averageDailyVolume3Month,
        usSitusEstateTax: ['NMS', 'NYQ', 'PCX', 'ASE', 'NGM'].includes(String(q.exchange)),
        notes: 'Live Yahoo reference only — ISIN, domicile, TER, replication and KID status are NOT verified. Confirm on the fund factsheet/KID before comparing instruments.',
        source: 'live',
      };
    } catch { /* next */ }
  }
  return null;
}

export async function resolveInstrument(symbol: string): Promise<InstrumentRecord | null> {
  const key = symbol.toUpperCase();
  if (CURATED[key]) return CURATED[key];
  return await liveLookup(key);
}
