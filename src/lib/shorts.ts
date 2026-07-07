/**
 * Short-selling helpers (simulation-only).
 *
 * Central place for borrow-rate / margin / cost math used by the
 * short-selling page, the paper-trading ticket and the position manager.
 * Nothing here talks to a real broker — the numbers are educational
 * estimates so the UI can surface warnings.
 */

export type BorrowDifficulty = "easy" | "moderate" | "hard-to-borrow" | "unavailable";

export interface BorrowMeta {
  /** Annualized borrow fee, e.g. 0.02 = 2% APR */
  rate: number;
  difficulty: BorrowDifficulty;
  /** Very rough available lot in shares (per broker inventory) */
  availableShares: number;
  note: string;
}

/** Reg-T initial short margin: 50% of notional. */
export const SHORT_INITIAL_MARGIN_PCT = 0.5;
/** Reg-T maintenance: 30% (some brokers 35%+ for HTB names). */
export const SHORT_MAINT_MARGIN_PCT = 0.3;

/** Curated list of illustrative short candidates for the dashboard.
 * These are static, opinionated examples for the education-only surface —
 * no real short-interest feed is wired up. */
export const SHORT_CANDIDATES: Array<{
  symbol: string;
  name: string;
  thesis: string;
  shortInterestPct: number;
  daysToCover: number;
  borrow: BorrowMeta;
}> = [
  {
    symbol: "GME",
    name: "GameStop Corp.",
    thesis: "Meme-flow reflexivity — squeeze risk both ways. Illustrative only.",
    shortInterestPct: 21.4,
    daysToCover: 2.1,
    borrow: { rate: 0.18, difficulty: "hard-to-borrow", availableShares: 5_000, note: "HTB — locate may fail intraday." },
  },
  {
    symbol: "BYND",
    name: "Beyond Meat",
    thesis: "Persistent gross-margin compression, refinancing overhang.",
    shortInterestPct: 38.5,
    daysToCover: 6.2,
    borrow: { rate: 0.35, difficulty: "hard-to-borrow", availableShares: 12_000, note: "Elevated crowd risk; borrow >30%." },
  },
  {
    symbol: "CVNA",
    name: "Carvana",
    thesis: "High leverage, credit-cycle sensitivity.",
    shortInterestPct: 15.1,
    daysToCover: 3.4,
    borrow: { rate: 0.09, difficulty: "moderate", availableShares: 45_000, note: "Borrow available but volatile fee." },
  },
  {
    symbol: "TSLA",
    name: "Tesla",
    thesis: "Deep-liquidity hedge leg — pair vs. semis or auto peers.",
    shortInterestPct: 3.1,
    daysToCover: 1.2,
    borrow: { rate: 0.005, difficulty: "easy", availableShares: 2_000_000, note: "GC (general collateral) — cheap to borrow." },
  },
  {
    symbol: "SPY",
    name: "SPDR S&P 500 ETF",
    thesis: "Broad-index hedge — pair against a long tech basket.",
    shortInterestPct: 1.4,
    daysToCover: 0.5,
    borrow: { rate: 0.003, difficulty: "easy", availableShares: 10_000_000, note: "Deep inventory, minimal fee." },
  },
  {
    symbol: "QQQ",
    name: "Invesco QQQ Trust",
    thesis: "Tech-heavy hedge against long single-name growth.",
    shortInterestPct: 1.1,
    daysToCover: 0.4,
    borrow: { rate: 0.003, difficulty: "easy", availableShares: 8_000_000, note: "Standard hedge instrument." },
  },
];

/** Rough heuristic when the symbol isn't in the curated list. */
export function estimateBorrow(symbol: string, spot: number | null): BorrowMeta {
  const hit = SHORT_CANDIDATES.find((c) => c.symbol.toUpperCase() === symbol.toUpperCase());
  if (hit) return hit.borrow;
  // Cheap large-caps default to GC; unknown micro-caps get flagged HTB.
  const cheap = (spot ?? 0) < 5;
  if (cheap) return { rate: 0.25, difficulty: "hard-to-borrow", availableShares: 2_000, note: "Sub-$5 name — locate not guaranteed." };
  return { rate: 0.01, difficulty: "easy", availableShares: 250_000, note: "General collateral estimate." };
}

export interface ShortMarginResult {
  notional: number;
  proceeds: number;
  initialMargin: number;
  maintenanceMargin: number;
  /** Cash available AFTER margin is reserved. */
  cashAvailableAfter: number;
  /** Underlying price at which a maintenance-margin call fires. */
  marginCallPrice: number;
}

export function computeShortMargin(price: number, qty: number, currentCash: number): ShortMarginResult {
  const notional = price * qty;
  const proceeds = notional;
  const initialMargin = notional * SHORT_INITIAL_MARGIN_PCT;
  const maintenanceMargin = notional * SHORT_MAINT_MARGIN_PCT;
  const cashAvailableAfter = currentCash + proceeds - initialMargin;
  // Margin call when (equity / short market value) < maintenance %
  // With initial equity = initialMargin, call price ≈ price * (1 + initialMargin/notional) / (1 + maintPct)
  // Simplified educational formula:
  const marginCallPrice = price * (1 + SHORT_INITIAL_MARGIN_PCT) / (1 + SHORT_MAINT_MARGIN_PCT);
  return { notional, proceeds, initialMargin, maintenanceMargin, cashAvailableAfter, marginCallPrice };
}

export type CheckSeverity = "ok" | "info" | "warn" | "danger";
export interface ShortCheckItem {
  id: string;
  label: string;
  severity: CheckSeverity;
  detail: string;
}

export interface ShortChecklistInput {
  symbol: string;
  qty: number;
  price: number;
  currentCash: number;
  stopPrice?: number | null;
  borrow: BorrowMeta;
}

export function buildShortChecklist(input: ShortChecklistInput): { items: ShortCheckItem[]; blocking: boolean } {
  const { symbol, qty, price, currentCash, stopPrice, borrow } = input;
  const m = computeShortMargin(price, qty, currentCash);
  const items: ShortCheckItem[] = [];

  // 1. Borrow availability
  if (borrow.difficulty === "unavailable" || borrow.availableShares < qty) {
    items.push({
      id: "borrow",
      label: "Borrow availability",
      severity: "danger",
      detail: `Only ~${borrow.availableShares.toLocaleString()} shares of ${symbol} available to borrow; you requested ${qty}. Real brokers would reject or partially fill.`,
    });
  } else if (borrow.difficulty === "hard-to-borrow") {
    items.push({
      id: "borrow",
      label: "Borrow availability",
      severity: "warn",
      detail: `HTB list: ~${(borrow.rate * 100).toFixed(1)}% borrow APR, ~${borrow.availableShares.toLocaleString()} shares available. Fees can spike or borrow can be recalled at any time.`,
    });
  } else {
    items.push({
      id: "borrow",
      label: "Borrow availability",
      severity: "ok",
      detail: `${borrow.difficulty.toUpperCase()} — est. ${(borrow.rate * 100).toFixed(2)}% APR borrow fee.`,
    });
  }

  // 2. Margin impact
  if (m.cashAvailableAfter < 0) {
    items.push({
      id: "margin",
      label: "Margin impact",
      severity: "danger",
      detail: `Initial margin ${fmtUsd(m.initialMargin)} exceeds available cash ${fmtUsd(currentCash)}. Order would be rejected.`,
    });
  } else {
    items.push({
      id: "margin",
      label: "Margin impact",
      severity: "info",
      detail: `Initial margin ${fmtUsd(m.initialMargin)} reserved. Maintenance ${fmtUsd(m.maintenanceMargin)}. Margin call ≈ ${fmtUsd(m.marginCallPrice)}/sh.`,
    });
  }

  // 3. Max loss + stop
  if (!stopPrice || stopPrice <= price) {
    items.push({
      id: "stop",
      label: "Max loss / stop",
      severity: "warn",
      detail: `No protective stop above entry — theoretical max loss is UNLIMITED. Set a buy-stop above ${fmtUsd(price)} to bound risk.`,
    });
  } else {
    const stopLoss = (stopPrice - price) * qty;
    items.push({
      id: "stop",
      label: "Max loss / stop",
      severity: "ok",
      detail: `Buy-stop @ ${fmtUsd(stopPrice)} caps loss at ~${fmtUsd(stopLoss)} (${(((stopPrice - price) / price) * 100).toFixed(1)}% adverse move).`,
    });
  }

  // 4. Cost of carry
  const dailyCarry = (borrow.rate * m.notional) / 365;
  items.push({
    id: "carry",
    label: "Cost of carry",
    severity: dailyCarry > m.notional * 0.001 ? "warn" : "info",
    detail: `Est. borrow fee ≈ ${fmtUsd(dailyCarry)}/day, ${fmtUsd(dailyCarry * 30)}/month at ${(borrow.rate * 100).toFixed(2)}% APR. Simulation does not deduct this from cash.`,
  });

  const blocking = items.some((i) => i.severity === "danger");
  return { items, blocking };
}

/** Realized P&L including borrow-cost accrual for an open short. */
export function shortPnL(entryPrice: number, lastPrice: number, qty: number, daysHeld: number, borrowRate: number) {
  const priceGain = (entryPrice - lastPrice) * qty; // short profits when price falls
  const notional = entryPrice * qty;
  const carry = (borrowRate * notional * daysHeld) / 365;
  const net = priceGain - carry;
  return { priceGain, carry, net };
}

/** Suggest quick hedges for an open short: buy-stop, call overlay, pair long. */
export interface HedgeSuggestion {
  id: string;
  title: string;
  rationale: string;
  legs: Array<{ action: "buy" | "sell"; symbol: string; qty: number; kind: "stock" | "call" | "put"; strike?: number; note?: string }>;
  paperOrder: string;
}

export function suggestHedges(symbol: string, qty: number, entryPrice: number, lastPrice: number): HedgeSuggestion[] {
  const stopPrice = Math.round(lastPrice * 1.08 * 100) / 100;
  const callStrike = Math.round(lastPrice * 1.05);
  const putStrike = Math.round(lastPrice * 0.95);
  return [
    {
      id: "buy-stop",
      title: "Protective buy-stop",
      rationale: `Cover the short automatically if ${symbol} rallies +8% to ${stopPrice}. Caps loss but re-enters no protection after fill.`,
      legs: [{ action: "buy", symbol, qty, kind: "stock", note: `stop @ ${stopPrice}` }],
      paperOrder: `BUY-STOP ${qty} ${symbol} @ ${stopPrice} (close short)`,
    },
    {
      id: "call-overlay",
      title: "Long-call overlay",
      rationale: `Buy 1 OTM call per 100 short shares at ${callStrike}. Converts unlimited upside risk into a defined-loss synthetic bear call — costs premium.`,
      legs: [{ action: "buy", symbol, qty: Math.max(1, Math.ceil(qty / 100)), kind: "call", strike: callStrike }],
      paperOrder: `BUY ${Math.max(1, Math.ceil(qty / 100))} ${symbol} CALL @ strike ${callStrike} (hedge upside)`,
    },
    {
      id: "put-replace",
      title: "Replace short with long puts",
      rationale: `Cover the stock short and open long puts at ${putStrike} instead. Defined max loss = premium paid, no borrow fee, similar directional bias.`,
      legs: [
        { action: "buy", symbol, qty, kind: "stock", note: "cover short" },
        { action: "buy", symbol, qty: Math.max(1, Math.ceil(qty / 100)), kind: "put", strike: putStrike },
      ],
      paperOrder: `BUY-TO-COVER ${qty} ${symbol}; BUY ${Math.max(1, Math.ceil(qty / 100))} ${symbol} PUT @ strike ${putStrike}`,
    },
    {
      id: "pair-long",
      title: "Pair with sector-index long",
      rationale: `Neutralise beta by adding a long index (SPY/QQQ) of equal notional. Isolates the single-name thesis from market drift.`,
      legs: [{ action: "buy", symbol: "SPY", qty: Math.max(1, Math.round((entryPrice * qty) / 500)), kind: "stock", note: "beta hedge" }],
      paperOrder: `BUY ${Math.max(1, Math.round((entryPrice * qty) / 500))} SPY (beta hedge vs ${symbol} short)`,
    },
  ];
}

function fmtUsd(n: number) {
  if (!isFinite(n)) return "$∞";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

// ---- Persistence: per-portfolio short position preferences (target/stop) ----
const SHORT_PREF_KEY = "vela.shorts.prefs.v1";

export interface ShortPositionPrefs {
  target?: number;
  stop?: number;
  borrowRate?: number;
  entryPrice?: number;
  openedAt?: string;
}

type PrefsMap = Record<string, Record<string, ShortPositionPrefs>>;

function readAll(): PrefsMap {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(window.localStorage.getItem(SHORT_PREF_KEY) || "{}"); } catch { return {}; }
}

export function loadShortPrefs(portfolioId: string, symbol: string): ShortPositionPrefs {
  return readAll()[portfolioId]?.[symbol] ?? {};
}

export function saveShortPrefs(portfolioId: string, symbol: string, prefs: ShortPositionPrefs) {
  if (typeof window === "undefined") return;
  const all = readAll();
  all[portfolioId] = { ...(all[portfolioId] || {}), [symbol]: { ...(all[portfolioId]?.[symbol] || {}), ...prefs } };
  window.localStorage.setItem(SHORT_PREF_KEY, JSON.stringify(all));
}