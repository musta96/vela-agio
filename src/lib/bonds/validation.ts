// Convention validation for the bond calculator. Two modes:
//   • Textbook: a small set of canonical bonds with known price/YTM/duration.
//     We reprice under the user's current conventions and flag mismatches.
//   • User reference: given the user's inputs plus an expected price/YTM/
//     duration, we grid across day-count × frequency × price-mode combos and
//     surface the combo whose output matches within tolerance.

import { bondMetrics, priceAtYield, yieldToMaturity, type BondInputs, type DayCount } from "./pricing";

export interface TextbookCase {
  id: string;
  label: string;
  source: string;
  inputs: BondInputs;
  expected: { price?: number; ytm?: number; modifiedDuration?: number };
}

export const TEXTBOOK_CASES: TextbookCase[] = [
  {
    id: "fabozzi-10y-4pct",
    label: "10-year 4% semi @ 5% YTM",
    source: "Fabozzi — Handbook of Fixed Income (par 100)",
    inputs: { face: 100, couponRate: 0.04, yearsToMaturity: 10, frequency: 2, yieldRate: 0.05, dayCount: "30/360" },
    expected: { price: 92.2054, modifiedDuration: 8.10 },
  },
  {
    id: "par-10y-8pct",
    label: "10-year 8% semi @ 8% YTM (par)",
    source: "Any standard text (par bond)",
    inputs: { face: 100, couponRate: 0.08, yearsToMaturity: 10, frequency: 2, yieldRate: 0.08, dayCount: "30/360" },
    expected: { price: 100.0, modifiedDuration: 6.90 },
  },
  {
    id: "zero-5y",
    label: "5-year zero @ 6% YTM, semi comp.",
    source: "Standard zero example",
    inputs: { face: 100, couponRate: 0, yearsToMaturity: 5, frequency: 2, yieldRate: 0.06, bondType: "zero", dayCount: "30/360" },
    expected: { price: 74.4094, modifiedDuration: 4.854 },
  },
];

export interface ValidationRow {
  metric: string;
  expected: number;
  actual: number;
  absDiff: number;
  match: boolean;
  tolerance: number;
}

export function validateTextbook(tc: TextbookCase, overrides: Partial<BondInputs>): ValidationRow[] {
  const merged: BondInputs = { ...tc.inputs, ...overrides };
  const m = bondMetrics(merged);
  const rows: ValidationRow[] = [];
  if (tc.expected.price != null) {
    rows.push(rowFor("Clean price", tc.expected.price, m.cleanPrice, 0.05));
  }
  if (tc.expected.modifiedDuration != null) {
    rows.push(rowFor("Modified duration", tc.expected.modifiedDuration, m.modifiedDuration, 0.05));
  }
  if (tc.expected.ytm != null) {
    const y = yieldToMaturity(merged, tc.expected.price ?? m.cleanPrice, merged.yieldRate);
    rows.push(rowFor("YTM (solved)", tc.expected.ytm, y, 0.0005));
  }
  return rows;
}

function rowFor(metric: string, expected: number, actual: number, tol: number): ValidationRow {
  const d = Math.abs(expected - actual);
  return { metric, expected, actual, absDiff: d, match: d <= tol, tolerance: tol };
}

/** Grid search across common convention combos to find matches for a reference. */
export interface ConventionGridResult {
  dayCount: DayCount;
  frequency: number;
  priceMode: "clean" | "dirty";
  price: number;
  ytm: number;
  modifiedDuration: number;
  match: boolean;
}

export function scanConventionGrid(
  base: Omit<BondInputs, "yieldRate" | "frequency" | "dayCount">,
  yieldRate: number,
  expected: { price?: number; modifiedDuration?: number },
  tol = { price: 0.1, duration: 0.1 },
): ConventionGridResult[] {
  const out: ConventionGridResult[] = [];
  const dcs: DayCount[] = ["ACT/365", "ACT/360", "30/360"];
  const freqs = [1, 2, 4];
  for (const dc of dcs) {
    for (const f of freqs) {
      for (const pm of ["clean", "dirty"] as const) {
        const inp: BondInputs = { ...base, yieldRate, frequency: f, dayCount: dc };
        const m = bondMetrics(inp);
        const px = pm === "clean" ? m.cleanPrice : m.dirtyPrice;
        const priceOK = expected.price == null ? true : Math.abs(expected.price - px) <= tol.price;
        const durOK = expected.modifiedDuration == null ? true : Math.abs(expected.modifiedDuration - m.modifiedDuration) <= tol.duration;
        out.push({
          dayCount: dc, frequency: f, priceMode: pm,
          price: px, ytm: yieldRate, modifiedDuration: m.modifiedDuration,
          match: priceOK && durOK,
        });
      }
    }
  }
  return out.sort((a, b) => Number(b.match) - Number(a.match));
}

/** Reprice with an explicit YTM to help the user tune inputs. */
export function repriceAt(inp: BondInputs, y: number): number {
  return priceAtYield(inp, y);
}