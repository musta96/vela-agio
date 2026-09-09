// =====================================================================
// data-entitlements — the catalogue of market-data / research providers
// the platform can use, which plan tier unlocks them, and whether the
// credential is currently configured.
//
// Free providers are always on. Paid ones stay "available_to_enable"
// until a key is configured (platform-wide secret, or the user's BYO key
// in the vault) AND the user's tier allows them.
// =====================================================================

export type Tier = 'free' | 'plus' | 'pro' | 'enterprise';

export interface ProviderSpec {
  id: string;
  name: string;
  category: 'prices' | 'fundamentals' | 'borrow' | 'insider' | 'news' | 'options' | 'research';
  cost: 'free' | 'paid';
  minTier: Tier;
  envKey?: string;          // platform-wide secret name
  vaultKey?: string;        // BYO key id in keys-vault
  description: string;
  docsUrl?: string;
}

export const PROVIDERS: ProviderSpec[] = [
  { id: 'yahoo', name: 'Yahoo Finance', category: 'prices', cost: 'free', minTier: 'free', description: 'Adjusted daily/intraday history and quotes for all mapped global exchanges.' },
  { id: 'stooq', name: 'Stooq', category: 'prices', cost: 'free', minTier: 'free', description: 'Free daily EOD history fallback.' },
  { id: 'sec_edgar', name: 'SEC EDGAR', category: 'insider', cost: 'free', minTier: 'free', description: 'US Forms 3/4/5, 10-K/10-Q/8-K, 13F.' },
  { id: 'regulator_research', name: 'Global regulator research', category: 'insider', cost: 'free', minTier: 'free', description: 'MAR Art.19, SEDI, EDINET, DART, HKEXnews, SEBI, ASX 3Y, SENS, CVM and more via the research engine.' },
  { id: 'ibkr_shortstock', name: 'IBKR public borrow file', category: 'borrow', cost: 'free', minTier: 'free', description: 'Daily shortable shares and indicative borrow fee for 20+ markets.' },
  { id: 'financial_datasets', name: 'Financial Datasets', category: 'prices', cost: 'paid', minTier: 'pro', envKey: 'FINANCIAL_DATASETS_API_KEY', vaultKey: 'financial_datasets', description: 'Corporate-action adjusted prices, total returns and standardized fundamentals for 15y+ backtests.', docsUrl: 'https://docs.financialdatasets.ai' },
  { id: 'polygon', name: 'Polygon.io', category: 'prices', cost: 'paid', minTier: 'pro', envKey: 'POLYGON_API_KEY', vaultKey: 'polygon', description: 'Tick/intraday US market data and options aggregates.' },
  { id: 'fmp', name: 'Financial Modeling Prep', category: 'fundamentals', cost: 'paid', minTier: 'plus', envKey: 'FMP_API_KEY', vaultKey: 'fmp', description: 'Global fundamentals, peer sets and transcript archive.' },
  { id: 'orbisa', name: 'Orbisa / S3 borrow', category: 'borrow', cost: 'paid', minTier: 'enterprise', envKey: 'ORBISA_API_KEY', vaultKey: 'orbisa', description: 'Institutional securities-lending: utilisation, real borrow fee curves, recall risk.' },
  { id: 'opra', name: 'OPRA options chain', category: 'options', cost: 'paid', minTier: 'pro', envKey: 'OPRA_API_KEY', vaultKey: 'opra', description: 'Real-time consolidated US options quotes and full volatility surface.' },
  { id: 'refinitiv_insider', name: 'Global insider vendor', category: 'insider', cost: 'paid', minTier: 'enterprise', envKey: 'INSIDER_VENDOR_API_KEY', vaultKey: 'insider_vendor', description: 'Normalized worldwide insider/PDMR transactions with history.' },
  { id: 'longbridge', name: 'Longbridge OpenAPI', category: 'prices', cost: 'free', minTier: 'free', envKey: 'LONGBRIDGE_APP_KEY', vaultKey: 'LONGBRIDGE_APP_KEY', description: 'HK / US / China quotes and trading. Free self-serve key from a Longbridge account.', docsUrl: 'https://open.longbridge.com/en' },
  { id: 'quartr', name: 'Quartr', category: 'research', cost: 'paid', minTier: 'pro', envKey: 'QUARTR_API_KEY', vaultKey: 'QUARTR_API_KEY', description: 'Earnings calls, transcripts and investor presentations.', docsUrl: 'https://quartr.com/solutions/api' },
  { id: 'daloopa', name: 'Daloopa', category: 'fundamentals', cost: 'paid', minTier: 'enterprise', envKey: 'DALOOPA_API_KEY', vaultKey: 'DALOOPA_API_KEY', description: 'Analyst-grade standardized fundamentals sourced from filings.' },
  { id: 'third_bridge', name: 'Third Bridge Forum', category: 'research', cost: 'paid', minTier: 'enterprise', envKey: 'THIRD_BRIDGE_API_KEY', vaultKey: 'THIRD_BRIDGE_API_KEY', description: 'Expert-network interview transcripts.' },
  { id: 'bigdata', name: 'Bigdata.com (RavenPack)', category: 'news', cost: 'paid', minTier: 'enterprise', envKey: 'BIGDATA_API_KEY', vaultKey: 'BIGDATA_API_KEY', description: 'News analytics and entity-level sentiment at scale.' },
  { id: 'datasite', name: 'Datasite', category: 'research', cost: 'paid', minTier: 'enterprise', envKey: 'DATASITE_API_KEY', vaultKey: 'DATASITE_API_KEY', description: 'M&A deal-room documents and diligence workflow.' },
  { id: 'mergerlinks', name: 'MergerLinks', category: 'news', cost: 'paid', minTier: 'pro', envKey: 'MERGERLINKS_API_KEY', vaultKey: 'MERGERLINKS_API_KEY', description: 'M&A transactions, advisors and league-table news.' },

  // --- Startup / private-market discovery ---
  { id: 'sec_formd', name: 'SEC Form D filings', category: 'research', cost: 'free', minTier: 'free', description: 'Recent US private-company fundraising filings from SEC EDGAR.' },
  { id: 'startup_news', name: 'Startup funding news', category: 'news', cost: 'free', minTier: 'free', description: 'Google News funding-announcement search for private companies.' },
  { id: 'crunchbase_api', name: 'Crunchbase', category: 'research', cost: 'paid', minTier: 'plus', envKey: 'CRUNCHBASE_API_KEY', vaultKey: 'CRUNCHBASE_API_KEY', description: 'Private-company profiles, funding rounds and investors.' },
  { id: 'pitchbook_api', name: 'PitchBook', category: 'research', cost: 'paid', minTier: 'enterprise', envKey: 'PITCHBOOK_API_KEY', vaultKey: 'PITCHBOOK_API_KEY', description: 'PE/VC deal flow, valuations and LP data.' },
  { id: 'dealroom_api', name: 'Dealroom', category: 'research', cost: 'paid', minTier: 'enterprise', envKey: 'DEALROOM_API_KEY', vaultKey: 'DEALROOM_API_KEY', description: 'European and global startup ecosystem data.' },
];

const ORDER: Tier[] = ['free', 'plus', 'pro', 'enterprise'];
export const tierAllows = (userTier: Tier, min: Tier) => ORDER.indexOf(userTier) >= ORDER.indexOf(min);

export function providerStatus(userTier: Tier = 'free') {
  return PROVIDERS.map((p) => {
    const configured = !!(p.envKey && Deno.env.get(p.envKey));
    const allowed = tierAllows(userTier, p.minTier);
    return {
      ...p,
      configured,
      allowed,
      state: p.cost === 'free' ? 'active'
        : configured && allowed ? 'active'
        : !allowed ? 'requires_upgrade'
        : 'available_to_enable',
    };
  });
}
