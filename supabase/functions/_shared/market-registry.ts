// =====================================================================
// Market registry — maps a Yahoo-style ticker suffix to its market,
// regulator and the OFFICIAL insider / PDMR ("managers' transactions")
// disclosure source for that jurisdiction.
//
// Used by `insider-global` so insider data is not US-only: EU issuers
// publish MAR Art.19 PDMR notifications through national authorities and
// the exchange news services, APAC/MEA issuers through their exchanges.
// =====================================================================

export interface MarketInfo {
  suffix: string;            // Yahoo suffix ("" = US)
  market: string;            // human label
  country: string;
  regulator: string;
  regime: string;            // legal basis for insider disclosure
  sources: string[];         // official domains to prioritise
  searchHints: string[];     // localised terms used to find the disclosures
  currency?: string;
}

const M = (
  suffix: string, market: string, country: string, regulator: string,
  regime: string, sources: string[], searchHints: string[], currency?: string,
): MarketInfo => ({ suffix, market, country, regulator, regime, sources, searchHints, currency });

export const MARKETS: MarketInfo[] = [
  // --- Americas ---
  M('', 'US (NYSE/Nasdaq)', 'US', 'SEC', 'Section 16 — Forms 3/4/5', ['sec.gov'], ['Form 4 insider transaction'], 'USD'),
  M('.TO', 'Toronto (TSX)', 'CA', 'CSA', 'SEDI insider reports', ['sedi.ca', 'canadianinsider.com', 'sedarplus.ca'], ['SEDI insider report'], 'CAD'),
  M('.V', 'TSX Venture', 'CA', 'CSA', 'SEDI insider reports', ['sedi.ca', 'sedarplus.ca'], ['SEDI insider report'], 'CAD'),
  M('.SA', 'B3 São Paulo', 'BR', 'CVM', 'CVM Res. 44 / Form 30-XI-33', ['gov.br', 'b3.com.br', 'rad.cvm.gov.br'], ['negociação administradores CVM 44'], 'BRL'),
  M('.MX', 'BMV Mexico', 'MX', 'CNBV', 'LMV insider reporting', ['bmv.com.mx', 'gob.mx'], ['operaciones personas relacionadas BMV'], 'MXN'),
  M('.SN', 'Santiago', 'CL', 'CMF', 'Ley 18.045 Art.20', ['cmfchile.cl'], ['hecho esencial transacción directores'], 'CLP'),
  M('.BA', 'Buenos Aires', 'AR', 'CNV', 'CNV insider reporting', ['argentina.gob.ar', 'bolsar.info'], ['operaciones directores CNV'], 'ARS'),

  // --- Europe (MAR Art.19 PDMR) ---
  M('.MI', 'Borsa Italiana', 'IT', 'Consob', 'MAR Art.19 — Internal Dealing', ['consob.it', 'borsaitaliana.it', 'emarketstorage.com'], ['internal dealing operazioni soggetti rilevanti'], 'EUR'),
  M('.L', 'London (LSE)', 'GB', 'FCA', 'UK MAR Art.19 — PDMR (RNS)', ['fca.org.uk', 'londonstockexchange.com', 'investegate.co.uk'], ['PDMR shareholding transaction RNS'], 'GBP'),
  M('.DE', 'XETRA', 'DE', 'BaFin', 'MAR Art.19 — Directors\u2019 Dealings', ['bafin.de', 'dgap.de', 'eqs-news.com'], ['Directors Dealings Eigengeschäfte Führungskräfte'], 'EUR'),
  M('.F', 'Frankfurt', 'DE', 'BaFin', 'MAR Art.19', ['bafin.de', 'eqs-news.com'], ['Directors Dealings'], 'EUR'),
  M('.PA', 'Euronext Paris', 'FR', 'AMF', 'MAR Art.19 — déclarations dirigeants', ['amf-france.org', 'euronext.com'], ['déclaration opérations dirigeants AMF'], 'EUR'),
  M('.AS', 'Euronext Amsterdam', 'NL', 'AFM', 'MAR Art.19', ['afm.nl', 'euronext.com'], ['AFM meldingen bestuurders transacties'], 'EUR'),
  M('.BR', 'Euronext Brussels', 'BE', 'FSMA', 'MAR Art.19', ['fsma.be', 'euronext.com'], ['FSMA transacties leidinggevenden'], 'EUR'),
  M('.LS', 'Euronext Lisbon', 'PT', 'CMVM', 'MAR Art.19', ['cmvm.pt', 'euronext.com'], ['transações dirigentes CMVM'], 'EUR'),
  M('.MC', 'BME Madrid', 'ES', 'CNMV', 'MAR Art.19', ['cnmv.es', 'bolsamadrid.es'], ['operaciones directivos CNMV comunicación'], 'EUR'),
  M('.SW', 'SIX Swiss', 'CH', 'SIX Exchange Regulation', 'SIX Art.56 Management Transactions', ['six-group.com', 'ser-ag.com'], ['management transactions SIX disclosure'], 'CHF'),
  M('.VI', 'Vienna', 'AT', 'FMA', 'MAR Art.19', ['fma.gv.at', 'wienerborse.at'], ['Directors Dealings Wiener Börse'], 'EUR'),
  M('.ST', 'Stockholm', 'SE', 'Finansinspektionen', 'MAR Art.19 — insynsregistret', ['fi.se', 'nasdaqomxnordic.com'], ['insynshandel insynsregistret FI'], 'SEK'),
  M('.OL', 'Oslo Børs', 'NO', 'Finanstilsynet', 'MAR Art.19', ['finanstilsynet.no', 'newsweb.oslobors.no'], ['primærinnsidere meldepliktig handel'], 'NOK'),
  M('.CO', 'Copenhagen', 'DK', 'Finanstilsynet', 'MAR Art.19', ['finanstilsynet.dk', 'nasdaqomxnordic.com'], ['ledende medarbejderes transaktioner'], 'DKK'),
  M('.HE', 'Helsinki', 'FI', 'FIN-FSA', 'MAR Art.19', ['finanssivalvonta.fi', 'nasdaqomxnordic.com'], ['johdon liiketoimet ilmoitus'], 'EUR'),
  M('.IR', 'Euronext Dublin', 'IE', 'Central Bank of Ireland', 'MAR Art.19', ['centralbank.ie', 'euronext.com'], ['PDMR transaction Euronext Dublin'], 'EUR'),
  M('.AT', 'Athens', 'GR', 'HCMC', 'MAR Art.19', ['hcmc.gr', 'athexgroup.gr'], ['συναλλαγές υπόχρεων προσώπων'], 'EUR'),
  M('.WA', 'Warsaw (GPW)', 'PL', 'KNF', 'MAR Art.19', ['knf.gov.pl', 'gpw.pl'], ['transakcje osób pełniących obowiązki zarządcze'], 'PLN'),
  M('.PR', 'Prague', 'CZ', 'ČNB', 'MAR Art.19', ['cnb.cz', 'pse.cz'], ['manager transactions disclosure'], 'CZK'),
  M('.IS', 'Borsa İstanbul', 'TR', 'CMB (SPK)', 'KAP material event disclosure', ['kap.org.tr', 'spk.gov.tr'], ['yönetici işlemleri KAP bildirimi'], 'TRY'),

  // --- Middle East & Africa ---
  M('.SR', 'Tadawul (Saudi)', 'SA', 'CMA', 'Tadawul insider dealing disclosure', ['saudiexchange.sa', 'cma.org.sa'], ['insider ownership change disclosure Tadawul'], 'SAR'),
  M('.AE', 'ADX Abu Dhabi', 'AE', 'SCA', 'SCA insider trading disclosure', ['adx.ae', 'sca.gov.ae'], ['insider disclosure ADX'], 'AED'),
  M('.DU', 'Dubai (DFM)', 'AE', 'SCA', 'DFM insider disclosure', ['dfm.ae', 'sca.gov.ae'], ['insider trading disclosure DFM'], 'AED'),
  M('.QA', 'Qatar Exchange', 'QA', 'QFMA', 'QFMA insider disclosure', ['qe.com.qa', 'qfma.org.qa'], ['insider disclosure Qatar Exchange'], 'QAR'),
  M('.KW', 'Boursa Kuwait', 'KW', 'CMA Kuwait', 'CMA disclosure rules', ['boursakuwait.com.kw', 'cma.gov.kw'], ['insider disclosure Boursa Kuwait'], 'KWD'),
  M('.TA', 'Tel Aviv (TASE)', 'IL', 'ISA', 'ISA interested-party reports', ['maya.tase.co.il', 'isa.gov.il'], ['דיווח בעל עניין עסקה'], 'ILS'),
  M('.CA', 'Egyptian Exchange', 'EG', 'FRA', 'EGX disclosure rules', ['egx.com.eg', 'fra.gov.eg'], ['insider disclosure EGX'], 'EGP'),
  M('.JO', 'Johannesburg (JSE)', 'ZA', 'JSE / FSCA', 'JSE Listings Req. 3.63 — director dealings (SENS)', ['jse.co.za', 'sensnews.co.za', 'fsca.co.za'], ['dealings in securities by directors SENS'], 'ZAR'),
  M('.NR', 'Nigerian Exchange', 'NG', 'SEC Nigeria', 'NGX insider dealing disclosure', ['ngxgroup.com', 'sec.gov.ng'], ['insider dealing disclosure NGX'], 'NGN'),

  // --- Asia-Pacific ---
  M('.T', 'Tokyo (TSE)', 'JP', 'FSA / JPX', 'FIEA Art.163 — officers\u2019 trading reports (EDINET)', ['disclosure2.edinet-fsa.go.jp', 'fsa.go.jp', 'jpx.co.jp'], ['役員 特定有価証券 売買報告書'], 'JPY'),
  M('.HK', 'Hong Kong (HKEX)', 'HK', 'SFC', 'SFO Part XV — Disclosure of Interests (Forms 3A/3B)', ['hkexnews.hk', 'sfc.hk'], ['disclosure of interests director HKEXnews'], 'HKD'),
  M('.SS', 'Shanghai (SSE)', 'CN', 'CSRC', 'CSRC rules on share changes by directors/supervisors', ['sse.com.cn', 'csrc.gov.cn', 'cninfo.com.cn'], ['董事 监事 高级管理人员 持股变动'], 'CNY'),
  M('.SZ', 'Shenzhen (SZSE)', 'CN', 'CSRC', 'CSRC share-change disclosure', ['szse.cn', 'cninfo.com.cn'], ['高管持股变动 减持'], 'CNY'),
  M('.KS', 'KOSPI (Korea)', 'KR', 'FSS', 'FSCMA — ownership reports (DART)', ['dart.fss.or.kr', 'fss.or.kr'], ['임원ㆍ주요주주 특정증권등 소유상황보고서'], 'KRW'),
  M('.KQ', 'KOSDAQ (Korea)', 'KR', 'FSS', 'FSCMA — ownership reports (DART)', ['dart.fss.or.kr'], ['소유상황보고서'], 'KRW'),
  M('.TW', 'Taiwan (TWSE)', 'TW', 'FSC', 'Securities Act Art.25 — insider shareholding', ['mops.twse.com.tw', 'twse.com.tw'], ['內部人持股轉讓 申報'], 'TWD'),
  M('.NS', 'NSE India', 'IN', 'SEBI', 'SEBI PIT Regulations Reg.7(2)', ['nseindia.com', 'sebi.gov.in'], ['insider trading SAST disclosure Reg 7(2)'], 'INR'),
  M('.BO', 'BSE India', 'IN', 'SEBI', 'SEBI PIT Reg.7(2)', ['bseindia.com', 'sebi.gov.in'], ['insider trading disclosure BSE'], 'INR'),
  M('.SI', 'Singapore (SGX)', 'SG', 'MAS / SGX', 'SFA s.133 — director interest notifications', ['sgx.com', 'mas.gov.sg'], ['change in director interest SGXNet'], 'SGD'),
  M('.KL', 'Bursa Malaysia', 'MY', 'SC Malaysia', 'Bursa Listing Req. Ch.14', ['bursamalaysia.com', 'sc.com.my'], ['changes in directors interest Bursa'], 'MYR'),
  M('.BK', 'Thailand (SET)', 'TH', 'SEC Thailand', 'Form 59 — securities holding report', ['market.sec.or.th', 'set.or.th'], ['แบบ 59 รายงานการถือหลักทรัพย์'], 'THB'),
  M('.JK', 'Indonesia (IDX)', 'ID', 'OJK', 'OJK Reg. 11/POJK.04/2017', ['idx.co.id', 'ojk.go.id'], ['laporan kepemilikan saham direksi'], 'IDR'),
  M('.PS', 'Philippines (PSE)', 'PH', 'SEC PH', 'SEC Form 23-B', ['edge.pse.com.ph', 'sec.gov.ph'], ['SEC Form 23-B statement of changes'], 'PHP'),
  M('.VN', 'Vietnam (HOSE)', 'VN', 'SSC', 'Insider share transaction disclosure', ['hsx.vn', 'ssc.gov.vn'], ['giao dịch cổ phiếu người nội bộ'], 'VND'),
  M('.AX', 'ASX Australia', 'AU', 'ASIC / ASX', 'Listing Rule 3.19A — Appendix 3Y', ['asx.com.au', 'asic.gov.au'], ['Appendix 3Y change of directors interest notice'], 'AUD'),
  M('.NZ', 'NZX New Zealand', 'NZ', 'FMA', 'FMCA — director & officer disclosures', ['nzx.com', 'fma.govt.nz'], ['director disclosure notice NZX'], 'NZD'),
];

const BY_SUFFIX = new Map(MARKETS.map((m) => [m.suffix, m]));

export function marketForSymbol(symbol: string): MarketInfo {
  const s = symbol.trim().toUpperCase();
  const dot = s.lastIndexOf('.');
  if (dot > 0) {
    const suffix = s.slice(dot);
    const hit = BY_SUFFIX.get(suffix);
    if (hit) return hit;
    return {
      suffix, market: `Unmapped exchange (${suffix})`, country: '??',
      regulator: 'Local securities regulator', regime: 'Local insider-disclosure regime',
      sources: [], searchHints: ['insider transaction disclosure'],
    };
  }
  return BY_SUFFIX.get('')!;
}

export function isUsSymbol(symbol: string): boolean {
  return marketForSymbol(symbol).suffix === '';
}
