// Country-aware amortization & capital gains heuristics for Net Worth assets.
// These are simplified rules suitable for personal planning - not tax advice.

export type CountryCode = "IT" | "US" | "UK" | "FR" | "DE" | "ES" | "CH" | "OTHER";

export interface AmortizationRule {
  /** Annual depreciation rate (straight-line), as a decimal (e.g. 0.03 = 3%/year). */
  ratePerYear: number;
  /** Useful life in years (informational). */
  usefulLifeYears: number;
  /** Whether residual/salvage value is conventionally retained. */
  salvageFraction: number;
  /** Plain-language note shown to the user. */
  note: string;
}

/** Amortization rates by category and country (personal/civil accounting approximations). */
const RULES: Record<string, Partial<Record<CountryCode, AmortizationRule>>> = {
  real_estate: {
    IT:    { ratePerYear: 0.03, usefulLifeYears: 33, salvageFraction: 0.20, note: "Italy: fabbricati civili 3%/anno (DM 31/12/1988), terreno escluso (~20%)." },
    US:    { ratePerYear: 1/27.5, usefulLifeYears: 27.5, salvageFraction: 0.20, note: "US: residential rental MACRS 27.5y straight-line; land not depreciable." },
    UK:    { ratePerYear: 0,     usefulLifeYears: 0,    salvageFraction: 0,    note: "UK: no depreciation on residential property; capital allowances limited to qualifying fixtures." },
    FR:    { ratePerYear: 0.02,  usefulLifeYears: 50,   salvageFraction: 0.15, note: "France: amortissement linéaire ~2%/an pour structure, hors terrain." },
    DE:    { ratePerYear: 0.02,  usefulLifeYears: 50,   salvageFraction: 0.15, note: "Germany: AfA 2%/yr for residential (pre-2023 builds), land excluded." },
    ES:    { ratePerYear: 0.03,  usefulLifeYears: 33,   salvageFraction: 0.20, note: "Spain: amortización 3%/año sobre construcción, suelo excluido." },
    CH:    { ratePerYear: 0.015, usefulLifeYears: 66,   salvageFraction: 0.20, note: "Switzerland: cantonal - ~1.5%/yr typical, land excluded." },
    OTHER: { ratePerYear: 0.025, usefulLifeYears: 40,   salvageFraction: 0.20, note: "Generic: ~2.5%/yr on structure, land excluded." },
  },
  vehicles: {
    IT:    { ratePerYear: 0.25, usefulLifeYears: 4, salvageFraction: 0,    note: "Italy: autoveicoli 25%/anno (coeff. ammortamento DM 31/12/1988)." },
    US:    { ratePerYear: 0.20, usefulLifeYears: 5, salvageFraction: 0,    note: "US: vehicles MACRS 5y class (20%/yr straight-line equivalent)." },
    UK:    { ratePerYear: 0.18, usefulLifeYears: 5, salvageFraction: 0,    note: "UK: capital allowances WDA 18%/yr (main pool)." },
    FR:    { ratePerYear: 0.20, usefulLifeYears: 5, salvageFraction: 0,    note: "France: véhicules amortis sur 5 ans (~20%/an linéaire)." },
    DE:    { ratePerYear: 1/6,  usefulLifeYears: 6, salvageFraction: 0,    note: "Germany: AfA-Tabelle Pkw 6 Jahre." },
    ES:    { ratePerYear: 0.16, usefulLifeYears: 6, salvageFraction: 0,    note: "Spain: tabla 16%/año, vida útil ~14 años máx." },
    CH:    { ratePerYear: 0.40, usefulLifeYears: 3, salvageFraction: 0,    note: "Switzerland: degressivo 40%/yr accepted for vehicles." },
    OTHER: { ratePerYear: 0.20, usefulLifeYears: 5, salvageFraction: 0,    note: "Generic: 20%/yr over ~5 years." },
  },
  collectibles: {
    IT:    { ratePerYear: 0, usefulLifeYears: 0, salvageFraction: 1, note: "Italy: opere d'arte e collezionismo non si ammortizzano; possibili plusvalenze tassate al 26%." },
    OTHER: { ratePerYear: 0, usefulLifeYears: 0, salvageFraction: 1, note: "Collectibles generally do not depreciate - capital gains apply on sale." },
  },
  private_equity: {
    IT:    { ratePerYear: 0, usefulLifeYears: 0, salvageFraction: 1, note: "Italy: partecipazioni non ammortizzabili; eventuali svalutazioni a fair value." },
    OTHER: { ratePerYear: 0, usefulLifeYears: 0, salvageFraction: 1, note: "Equity stakes do not amortize - value at fair market." },
  },
};

/** Capital gains tax rates (long-term equity / general financial gains, simplified). */
export const CGT_RATES: Record<CountryCode, { equity: number; crypto: number; realEstate: number; collectibles: number; startup?: number; note: string }> = {
  IT:    { equity: 0.26, crypto: 0.26, realEstate: 0.26, collectibles: 0.26, startup: 0.26, note: "Italia: aliquota 26% su plusvalenze finanziarie e crypto; immobili tassati 26% se vendita entro 5 anni (esenti prima casa). Start-up innovative: esenzioni se holding period rispettati (art. 14 DL 73/2021)." },
  US:    { equity: 0.20, crypto: 0.20, realEstate: 0.20, collectibles: 0.28, startup: 0.00, note: "US: LTCG 0/15/20% by bracket; collectibles capped 28%; QSBS §1202 up to 100% exclusion." },
  UK:    { equity: 0.20, crypto: 0.20, realEstate: 0.24, collectibles: 0.20, note: "UK: CGT 10/20% (24% residential property); BADR 14% (rising)." },
  FR:    { equity: 0.30, crypto: 0.30, realEstate: 0.362, collectibles: 0.30, note: "France: PFU 30% (12.8% IR + 17.2% PS); immobilier 19% + 17.2% PS = 36.2%." },
  DE:    { equity: 0.2638, crypto: 0, realEstate: 0, collectibles: 0, note: "Germany: Abgeltungsteuer 25% + Soli ≈ 26.38%; crypto/property tax-free after 1y/10y holding." },
  ES:    { equity: 0.23, crypto: 0.23, realEstate: 0.23, collectibles: 0.23, note: "Spain: 19–28% scale; modelled at ~23% effective." },
  CH:    { equity: 0, crypto: 0, realEstate: 0.20, collectibles: 0, note: "Switzerland: private capital gains generally tax-free; real-estate cantonal." },
  OTHER: { equity: 0.20, crypto: 0.20, realEstate: 0.20, collectibles: 0.20, note: "Generic 20% placeholder - set your fiscal residency in Profile for accurate rules." },
};

export function normalizeCountry(code?: string | null): CountryCode {
  if (!code) return "OTHER";
  const c = code.trim().toUpperCase();
  if (["IT","US","UK","GB","FR","DE","ES","CH"].includes(c)) return (c === "GB" ? "UK" : c) as CountryCode;
  return "OTHER";
}

export function getAmortizationRule(category: string, country: CountryCode): AmortizationRule | null {
  const byCat = RULES[category];
  if (!byCat) return null;
  return byCat[country] || byCat.OTHER || null;
}

export interface AmortizationSchedule {
  yearsElapsed: number;
  annualDepreciation: number;
  accumulatedDepreciation: number;
  bookValue: number;
  salvageFloor: number;
  rows: { year: number; depreciation: number; accumulated: number; bookValue: number }[];
}

export function computeAmortization(opts: {
  category: string;
  country: CountryCode;
  purchasePrice: number;
  purchaseDate: string; // YYYY-MM-DD
  yearsToProject?: number;
}): { rule: AmortizationRule; schedule: AmortizationSchedule } | null {
  const rule = getAmortizationRule(opts.category, opts.country);
  if (!rule || rule.ratePerYear <= 0 || opts.purchasePrice <= 0 || !opts.purchaseDate) return null;
  const start = new Date(opts.purchaseDate);
  const now = new Date();
  const yearsElapsed = Math.max(0, (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
  const salvageFloor = opts.purchasePrice * rule.salvageFraction;
  const annualDepreciation = (opts.purchasePrice - salvageFloor) * rule.ratePerYear;
  const accumulated = Math.min(annualDepreciation * yearsElapsed, opts.purchasePrice - salvageFloor);
  const bookValue = Math.max(salvageFloor, opts.purchasePrice - accumulated);

  const years = opts.yearsToProject ?? Math.min(rule.usefulLifeYears || 10, 30);
  const rows: AmortizationSchedule["rows"] = [];
  let acc = 0;
  for (let y = 1; y <= years; y++) {
    const dep = Math.min(annualDepreciation, opts.purchasePrice - salvageFloor - acc);
    acc += dep;
    rows.push({
      year: y,
      depreciation: Math.max(0, dep),
      accumulated: acc,
      bookValue: Math.max(salvageFloor, opts.purchasePrice - acc),
    });
  }
  return {
    rule,
    schedule: { yearsElapsed, annualDepreciation, accumulatedDepreciation: accumulated, bookValue, salvageFloor, rows },
  };
}

/** Estimate capital gains tax on a sale (current value − purchase price), country & category aware. */
export function estimateCapitalGainsTax(opts: {
  category: string;
  country: CountryCode;
  purchasePrice: number;
  currentValue: number;
  holdingYears?: number;
}): { gain: number; rateApplied: number; taxOwed: number; netProceeds: number; rationale: string } | null {
  const { category, country, purchasePrice, currentValue, holdingYears = 0 } = opts;
  if (!purchasePrice || !currentValue) return null;
  const gain = currentValue - purchasePrice;
  const rates = CGT_RATES[country];
  let rate = rates.equity;
  let rationale = rates.note;

  if (category === "real_estate") rate = rates.realEstate;
  else if (category === "crypto") rate = rates.crypto;
  else if (category === "collectibles") rate = rates.collectibles;
  else if (category === "private_equity" && rates.startup !== undefined) {
    rate = rates.startup;
    rationale += " | Start-up holding-period exemptions may further reduce this.";
  }

  // Country-specific holding period exemptions (simplified)
  if (country === "IT" && category === "real_estate" && holdingYears >= 5) {
    rate = 0; rationale = "Italia: vendita dopo 5 anni esente da plusvalenza (immobili non-prima-casa).";
  }
  if (country === "DE" && category === "real_estate" && holdingYears >= 10) {
    rate = 0; rationale = "Germany: Spekulationsfrist 10 years - no tax after holding period.";
  }
  if (country === "DE" && category === "crypto" && holdingYears >= 1) {
    rate = 0; rationale = "Germany: crypto tax-free after 1-year holding period.";
  }

  const taxOwed = gain > 0 ? gain * rate : 0;
  return { gain, rateApplied: rate, taxOwed, netProceeds: currentValue - taxOwed, rationale };
}