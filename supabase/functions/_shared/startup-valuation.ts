// =====================================================================
// startup-valuation — the methods an early-stage investor actually uses.
//
//   VC method                 exit value discounted at the required return
//   Required-IRR method       same engine, IRR taken from stage/geography
//   Scorecard (matrix)        regional median pre-money x weighted factors
//   Berkus                    pre-revenue, five milestone buckets
//   Risk-factor summation     median +/- twelve risk adjustments
//   Revenue/ARR comparables   sector + stage multiples
//   Previous-round anchor     last post-money re-priced by progress
//   Pre-money / post-money    round mechanics incl. option pool shuffle
//
// Every benchmark below is stage x region x sector aware, because a seed
// round in Milan is not priced like a seed round in the Bay Area.
// All amounts are in EUR unless the caller passes a different currency;
// the caller is responsible for FX.
// =====================================================================

export type Stage = 'pre_seed' | 'seed' | 'series_a' | 'series_b' | 'series_c' | 'growth';
export type Region = 'US' | 'UK' | 'EU_CORE' | 'IT' | 'NORDICS' | 'CEE' | 'MENA' | 'INDIA' | 'APAC' | 'LATAM' | 'AFRICA';

export const STAGES: Stage[] = ['pre_seed', 'seed', 'series_a', 'series_b', 'series_c', 'growth'];
export const REGIONS: Region[] = ['US', 'UK', 'EU_CORE', 'IT', 'NORDICS', 'CEE', 'MENA', 'INDIA', 'APAC', 'LATAM', 'AFRICA'];

/** Country -> venture region, so the user only picks a country. */
export const COUNTRY_REGION: Record<string, Region> = {
  US: 'US', CA: 'US', GB: 'UK', IE: 'UK',
  DE: 'EU_CORE', FR: 'EU_CORE', NL: 'EU_CORE', BE: 'EU_CORE', AT: 'EU_CORE', CH: 'EU_CORE', ES: 'EU_CORE', PT: 'EU_CORE',
  IT: 'IT', SE: 'NORDICS', NO: 'NORDICS', DK: 'NORDICS', FI: 'NORDICS',
  PL: 'CEE', CZ: 'CEE', RO: 'CEE', HU: 'CEE', GR: 'CEE', EE: 'CEE', LT: 'CEE',
  AE: 'MENA', SA: 'MENA', QA: 'MENA', EG: 'MENA', IL: 'MENA', TR: 'MENA',
  IN: 'INDIA', SG: 'APAC', JP: 'APAC', KR: 'APAC', CN: 'APAC', AU: 'APAC', NZ: 'APAC', ID: 'APAC',
  BR: 'LATAM', MX: 'LATAM', AR: 'LATAM', CL: 'LATAM', CO: 'LATAM',
  ZA: 'AFRICA', NG: 'AFRICA', KE: 'AFRICA',
};

/** Median pre-money valuation by stage, US baseline, EUR. */
const BASE_PREMONEY: Record<Stage, number> = {
  pre_seed: 4_500_000, seed: 11_000_000, series_a: 38_000_000,
  series_b: 100_000_000, series_c: 240_000_000, growth: 600_000_000,
};

/** How each venture market prices relative to the US baseline. */
const REGION_FACTOR: Record<Region, number> = {
  US: 1, UK: 0.72, EU_CORE: 0.62, IT: 0.45, NORDICS: 0.66, CEE: 0.40,
  MENA: 0.55, INDIA: 0.50, APAC: 0.62, LATAM: 0.45, AFRICA: 0.35,
};

/** Sector pricing relative to a generic software company. */
const SECTOR_FACTOR: Record<string, number> = {
  ai: 1.55, software: 1.0, saas: 1.05, fintech: 1.1, insurtech: 0.95, marketplace: 0.9,
  ecommerce: 0.65, consumer: 0.7, gaming: 0.8, healthtech: 1.0, biotech: 1.2, medtech: 1.0,
  deeptech: 1.25, semiconductors: 1.3, hardware: 0.7, robotics: 1.0, mobility: 0.8,
  energy: 0.9, climate: 1.0, agritech: 0.7, proptech: 0.7, logistics: 0.8,
  edtech: 0.7, cybersecurity: 1.2, space: 1.1, foodtech: 0.65, services: 0.5, other: 0.85,
};

export const SECTORS = Object.keys(SECTOR_FACTOR);

/** Required IRR by stage (US baseline), reflecting failure rates. */
const BASE_IRR: Record<Stage, number> = {
  pre_seed: 0.70, seed: 0.55, series_a: 0.42, series_b: 0.33, series_c: 0.27, growth: 0.22,
};
/** Emerging / thinner markets demand more; deep, liquid markets less. */
const REGION_IRR_ADJ: Record<Region, number> = {
  US: 0, UK: 0.01, EU_CORE: 0.02, IT: 0.04, NORDICS: 0.02, CEE: 0.05,
  MENA: 0.05, INDIA: 0.05, APAC: 0.03, LATAM: 0.07, AFRICA: 0.09,
};

/** Forward revenue / ARR multiples used for the comparables method. */
const REVENUE_MULTIPLE: Record<Stage, number> = {
  pre_seed: 20, seed: 16, series_a: 12, series_b: 9, series_c: 7, growth: 5,
};

/** Typical dilution from this round to exit, used by the VC method. */
const FUTURE_DILUTION: Record<Stage, number> = {
  pre_seed: 0.55, seed: 0.48, series_a: 0.35, series_b: 0.25, series_c: 0.15, growth: 0.08,
};

/** Years to exit assumed by stage. */
const YEARS_TO_EXIT: Record<Stage, number> = {
  pre_seed: 8, seed: 7, series_a: 6, series_b: 5, series_c: 4, growth: 3,
};

export interface StartupInputs {
  stage: Stage;
  country: string;
  sector: string;
  currency: string;
  // traction
  revenue?: number;            // last 12 months revenue / ARR
  revenueGrowth?: number;      // yoy, 0.8 = +80%
  grossMargin?: number;
  burnRate?: number;           // monthly net burn
  cashOnHand?: number;
  users?: number;
  // round
  roundSize?: number;
  targetOwnership?: number;    // fraction the new investor wants
  optionPool?: number;         // post-money pool as a fraction
  // history
  previousRounds?: Array<{ date?: string; stage?: string; amount?: number; postMoney?: number; investors?: string }>;
  // overrides
  requiredIrr?: number;
  yearsToExit?: number;
  exitMultiple?: number;       // EV / revenue at exit
  exitRevenue?: number;        // if the user has a plan
  // qualitative 0.5 - 1.5 (scorecard) and -2..+2 (risk factors)
  scorecard?: Partial<Record<ScorecardKey, number>>;
  riskFactors?: Partial<Record<RiskKey, number>>;
  berkus?: Partial<Record<BerkusKey, number>>;
}

export type ScorecardKey = 'team' | 'opportunity' | 'product' | 'competition' | 'sales' | 'funding_need' | 'other';
export const SCORECARD_WEIGHTS: Record<ScorecardKey, number> = {
  team: 0.30, opportunity: 0.25, product: 0.15, competition: 0.10, sales: 0.10, funding_need: 0.05, other: 0.05,
};
export type RiskKey =
  | 'management' | 'stage' | 'legislation' | 'manufacturing' | 'sales' | 'funding'
  | 'competition' | 'technology' | 'litigation' | 'international' | 'reputation' | 'exit';
export const RISK_KEYS: RiskKey[] = ['management', 'stage', 'legislation', 'manufacturing', 'sales', 'funding', 'competition', 'technology', 'litigation', 'international', 'reputation', 'exit'];
export type BerkusKey = 'idea' | 'prototype' | 'team' | 'relationships' | 'rollout';
export const BERKUS_KEYS: BerkusKey[] = ['idea', 'prototype', 'team', 'relationships', 'rollout'];

export interface MethodResult {
  key: string;
  label: string;
  preMoney: number | null;
  postMoney: number | null;
  applicable: boolean;
  weight: number;
  detail: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export function regionOf(country: string): Region {
  return COUNTRY_REGION[String(country ?? '').toUpperCase()] ?? 'EU_CORE';
}
export function sectorFactor(sector: string): number {
  const k = String(sector ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return SECTOR_FACTOR[k] ?? SECTOR_FACTOR[Object.keys(SECTOR_FACTOR).find((s) => k.includes(s)) ?? 'other'] ?? 0.85;
}

/** Stage x region x sector median pre-money — the anchor of several methods. */
export function benchmarkPreMoney(i: StartupInputs) {
  const region = regionOf(i.country);
  const base = BASE_PREMONEY[i.stage] ?? BASE_PREMONEY.seed;
  const rf = REGION_FACTOR[region];
  const sf = sectorFactor(i.sector);
  return { region, base, regionFactor: rf, sectorFactor: sf, median: base * rf * sf };
}

export function requiredIrr(i: StartupInputs) {
  if (Number.isFinite(Number(i.requiredIrr)) && Number(i.requiredIrr) > 0) {
    return { irr: Number(i.requiredIrr), source: 'user' as const, region: regionOf(i.country) };
  }
  const region = regionOf(i.country);
  const irr = (BASE_IRR[i.stage] ?? 0.5) + (REGION_IRR_ADJ[region] ?? 0.02);
  return { irr, source: 'benchmark' as const, region };
}

// ---------------------------------------------------------------- methods

function vcMethod(i: StartupInputs, irr: number, label: string, key: string, weight: number): MethodResult {
  const years = clamp(num(i.yearsToExit, YEARS_TO_EXIT[i.stage] ?? 6), 1, 12);
  const growth = clamp(num(i.revenueGrowth, i.stage === 'pre_seed' ? 1.5 : i.stage === 'seed' ? 1.2 : 0.7), -0.5, 4);
  const rev = num(i.revenue, 0);
  // A blank exit-revenue field arrives as 0; fall back to the growth path.
  const plannedExit = num(i.exitRevenue, 0);
  const exitRevenue = plannedExit > 0 ? plannedExit : (rev > 0 ? rev * Math.pow(1 + growth * 0.6, years) : 0);
  const exitMultRaw = num(i.exitMultiple, 0);
  const exitMult = exitMultRaw > 0 ? exitMultRaw : Math.max(REVENUE_MULTIPLE[i.stage] * 0.35, 3);
  if (!(exitRevenue > 0)) {
    return { key, label, preMoney: null, postMoney: null, applicable: false, weight: 0, detail: 'Needs revenue today or a planned exit revenue.' };
  }
  const exitValue = exitRevenue * exitMult;
  const dilution = clamp(num((i as { futureDilution?: number }).futureDilution, FUTURE_DILUTION[i.stage] ?? 0.35), 0, 0.9);
  const post = (exitValue / Math.pow(1 + irr, years)) * (1 - dilution);
  const pre = post - num(i.roundSize, 0);
  return {
    key, label, preMoney: Math.max(pre, 0), postMoney: Math.max(post, 0), applicable: true, weight,
    detail: `Exit revenue ${Math.round(exitRevenue).toLocaleString()} x ${exitMult.toFixed(1)}x = ${Math.round(exitValue).toLocaleString()} in ${years}y, discounted at ${(irr * 100).toFixed(0)}% and adjusted for ${(dilution * 100).toFixed(0)}% future dilution.`,
  };
}

function scorecardMethod(i: StartupInputs, median: number): MethodResult {
  const s = i.scorecard ?? {};
  const provided = (Object.keys(SCORECARD_WEIGHTS) as ScorecardKey[]).filter((k) => Number.isFinite(Number(s[k])));
  const multiplier = (Object.keys(SCORECARD_WEIGHTS) as ScorecardKey[])
    .reduce((acc, k) => acc + SCORECARD_WEIGHTS[k] * clamp(num(s[k], 1), 0.4, 1.75), 0);
  const pre = median * multiplier;
  return {
    key: 'scorecard', label: 'Scorecard / matrix method', preMoney: pre, postMoney: pre + num(i.roundSize, 0),
    applicable: true, weight: provided.length ? 1 : 0.6,
    detail: `Regional median ${Math.round(median).toLocaleString()} x ${multiplier.toFixed(2)} weighted factor score${provided.length ? '' : ' (all factors at par — rate them for a sharper result)'}.`,
  };
}

function berkusMethod(i: StartupInputs, median: number): MethodResult {
  // Berkus caps each of five milestones; the cap scales with the local market.
  const cap = clamp(median * 0.12, 150_000, 800_000);
  const b = i.berkus ?? {};
  const rated = BERKUS_KEYS.filter((k) => Number.isFinite(Number(b[k])));
  const pre = BERKUS_KEYS.reduce((acc, k) => acc + clamp(num(b[k], 0.5), 0, 1) * cap, 0);
  const applicable = num(i.revenue, 0) < median * 0.05 || i.stage === 'pre_seed' || i.stage === 'seed';
  return {
    key: 'berkus', label: 'Berkus (pre-revenue)', preMoney: pre, postMoney: pre + num(i.roundSize, 0),
    applicable, weight: applicable ? (rated.length ? 0.8 : 0.4) : 0,
    detail: `Five milestones capped at ${Math.round(cap).toLocaleString()} each${rated.length ? '' : ' (unrated milestones default to half credit)'}.`,
  };
}

function riskFactorMethod(i: StartupInputs, median: number): MethodResult {
  const step = clamp(median * 0.05, 50_000, 500_000);
  const rf = i.riskFactors ?? {};
  const rated = RISK_KEYS.filter((k) => Number.isFinite(Number(rf[k])));
  const adj = RISK_KEYS.reduce((acc, k) => acc + clamp(num(rf[k], 0), -2, 2) * step, 0);
  const pre = Math.max(median + adj, median * 0.2);
  return {
    key: 'risk_factor', label: 'Risk-factor summation', preMoney: pre, postMoney: pre + num(i.roundSize, 0),
    applicable: true, weight: rated.length ? 0.8 : 0.3,
    detail: `Median ${Math.round(median).toLocaleString()} adjusted by ${rated.length} rated risk factors at ${Math.round(step).toLocaleString()} per step.`,
  };
}

function comparablesMethod(i: StartupInputs): MethodResult {
  const rev = num(i.revenue, 0);
  if (!(rev > 0)) {
    return { key: 'comparables', label: 'Revenue / ARR comparables', preMoney: null, postMoney: null, applicable: false, weight: 0, detail: 'No revenue reported yet.' };
  }
  const region = regionOf(i.country);
  const growth = num(i.revenueGrowth, 0.6);
  // Growth and gross margin move the multiple the way the market does.
  const growthAdj = clamp(1 + (growth - 0.6) * 0.5, 0.5, 2.2);
  const marginAdj = clamp(0.7 + num(i.grossMargin, 0.7), 0.7, 1.3);
  const mult = REVENUE_MULTIPLE[i.stage] * sectorFactor(i.sector) * REGION_FACTOR[region] * growthAdj * marginAdj;
  const pre = rev * mult;
  return {
    key: 'comparables', label: 'Revenue / ARR comparables', preMoney: pre, postMoney: pre + num(i.roundSize, 0),
    applicable: true, weight: 1,
    detail: `${rev.toLocaleString()} revenue x ${mult.toFixed(1)}x (${i.stage.replace('_', ' ')}, ${region}, ${i.sector || 'generic'}, growth ${(growth * 100).toFixed(0)}%).`,
  };
}

function previousRoundMethod(i: StartupInputs): MethodResult {
  const rounds = (i.previousRounds ?? []).filter((r) => num(r.postMoney, 0) > 0 || num(r.amount, 0) > 0);
  const last = rounds[rounds.length - 1];
  if (!last || !(num(last.postMoney, 0) > 0)) {
    return { key: 'previous_round', label: 'Last round re-priced', preMoney: null, postMoney: null, applicable: false, weight: 0, detail: 'No previous post-money supplied.' };
  }
  const growth = num(i.revenueGrowth, 0.6);
  // A round is normally priced at a step-up driven by the progress since the
  // last one; strong growth earns more than the default 1.6x.
  const stepUp = clamp(1.2 + growth, 1.0, 4.0);
  const pre = num(last.postMoney) * stepUp;
  return {
    key: 'previous_round', label: 'Last round re-priced', preMoney: pre, postMoney: pre + num(i.roundSize, 0),
    applicable: true, weight: 0.9,
    detail: `Last post-money ${Math.round(num(last.postMoney)).toLocaleString()}${last.stage ? ` (${last.stage})` : ''} x ${stepUp.toFixed(2)} step-up for growth of ${(growth * 100).toFixed(0)}%.`,
  };
}

/** Round mechanics: ownership, option-pool shuffle, dilution, price check. */
export function roundMechanics(i: StartupInputs, chosenPreMoney: number | null) {
  const invest = num(i.roundSize, 0);
  const own = clamp(num(i.targetOwnership, 0), 0, 0.9);
  const pool = clamp(num(i.optionPool, 0), 0, 0.3);
  const fromOwnership = own > 0 && invest > 0 ? invest / own : null;       // post-money
  const postFromPre = chosenPreMoney != null ? chosenPreMoney + invest : null;
  const post = fromOwnership ?? postFromPre;
  const pre = post != null ? post - invest : null;
  // A pool created pre-money is funded by existing shareholders only.
  const effectivePre = pre != null ? pre * (1 - pool) : null;
  const founderDilution = post ? invest / post + pool : null;
  const rounds = i.previousRounds ?? [];
  const lastPost = rounds.length ? num(rounds[rounds.length - 1].postMoney, 0) : 0;
  return {
    investment: invest, targetOwnership: own || (post ? invest / post : null), optionPool: pool,
    postMoney: post, preMoney: pre, preMoneyAfterPoolShuffle: effectivePre,
    founderDilution,
    stepUpVsLastRound: lastPost > 0 && post ? post / lastPost : null,
    downRound: lastPost > 0 && post ? post < lastPost : false,
    totalRaisedBefore: rounds.reduce((a, r) => a + num(r.amount, 0), 0),
  };
}

export interface StartupValuationOutput {
  stage: Stage; region: Region; sector: string; currency: string;
  benchmark: ReturnType<typeof benchmarkPreMoney>;
  requiredIrr: ReturnType<typeof requiredIrr>;
  methods: MethodResult[];
  range: { low: number; mid: number; high: number; weighted: number } | null;
  round: ReturnType<typeof roundMechanics>;
  runwayMonths: number | null;
  notes: string[];
}

export function valueStartup(inputRaw: StartupInputs): StartupValuationOutput {
  const i: StartupInputs = { ...inputRaw, stage: (STAGES.includes(inputRaw.stage) ? inputRaw.stage : 'seed') };
  const bench = benchmarkPreMoney(i);
  const irr = requiredIrr(i);

  const methods: MethodResult[] = [
    vcMethod(i, irr.irr, 'VC method (benchmark exit)', 'vc_method', 1),
    vcMethod(i, irr.irr, `Required-IRR method (${(irr.irr * 100).toFixed(0)}%)`, 'required_irr', 0.9),
    scorecardMethod(i, bench.median),
    berkusMethod(i, bench.median),
    riskFactorMethod(i, bench.median),
    comparablesMethod(i),
    previousRoundMethod(i),
  ];

  const usable = methods.filter((m) => m.applicable && m.preMoney != null && m.preMoney > 0 && m.weight > 0) as Array<MethodResult & { preMoney: number }>;
  const values = usable.map((m) => m.preMoney).sort((a, b) => a - b);
  const totalW = usable.reduce((a, m) => a + m.weight, 0);
  const range = values.length
    ? {
      low: values[0],
      high: values[values.length - 1],
      mid: values.length % 2 ? values[values.length >> 1] : (values[(values.length >> 1) - 1] + values[values.length >> 1]) / 2,
      weighted: totalW > 0 ? usable.reduce((a, m) => a + m.preMoney * m.weight, 0) / totalW : values[0],
    }
    : null;

  const round = roundMechanics(i, range?.weighted ?? null);
  const burn = num(i.burnRate, 0);
  const runwayMonths = burn > 0 ? (num(i.cashOnHand, 0) + num(i.roundSize, 0)) / burn : null;

  const notes: string[] = [];
  if (!num(i.revenue, 0)) notes.push('No revenue reported: the qualitative methods (scorecard, Berkus, risk factors) carry the result.');
  if (round.downRound) notes.push('The implied post-money is below the last round — this prices as a down round and triggers anti-dilution terms.');
  if (runwayMonths != null && runwayMonths < 12) notes.push(`Runway after the round is ${runwayMonths.toFixed(0)} months; investors normally require 18-24.`);
  if (irr.source === 'benchmark') notes.push(`Required return taken from ${bench.region} ${i.stage.replace('_', ' ')} benchmarks (${(irr.irr * 100).toFixed(0)}%); override it if you have a fund hurdle.`);

  return {
    stage: i.stage, region: bench.region, sector: i.sector, currency: i.currency || 'EUR',
    benchmark: bench, requiredIrr: irr, methods, range, round, runwayMonths, notes,
  };
}
