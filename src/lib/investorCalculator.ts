export type PacInputs = {
  initial: number;
  monthly: number;
  years: number;
  annualReturn: number;
  annualCost: number;
  inflation: number;
};

/** Illustrative assumptions, not forecasts or recommended allocations. */
export const DEFAULT_PAC_INPUTS: PacInputs = {
  initial: 1000, monthly: 200, years: 20, annualReturn: 5, annualCost: 0.25, inflation: 2,
};

export const PAC_BOUNDS: Record<keyof PacInputs, [number, number]> = {
  initial: [0, 10000000], monthly: [0, 100000], years: [1, 50],
  annualReturn: [-50, 50], annualCost: [0, 10], inflation: [0, 20],
};

export function calculatePac(input: PacInputs) {
  for (const key of Object.keys(PAC_BOUNDS) as (keyof PacInputs)[]) {
    const [min, max] = PAC_BOUNDS[key];
    if (!Number.isFinite(input[key]) || input[key] < min || input[key] > max) {
      throw new RangeError(`Invalid ${key}`);
    }
  }
  if (!Number.isInteger(input.years)) throw new RangeError("Years must be whole");
  const months = input.years * 12;
  // Costs act as an annual proportional reduction in the portfolio value.
  const netAnnualFactor = (1 + input.annualReturn / 100) * (1 - input.annualCost / 100);
  const monthlyFactor = Math.pow(netAnnualFactor, 1 / 12);
  let nominal = input.initial;
  const points = [{ year: 0, contributed: input.initial, nominal, real: nominal }];
  for (let month = 1; month <= months; month++) {
    // Contributions at month end, after that month's growth.
    nominal = nominal * monthlyFactor + input.monthly;
    if (month % 12 === 0) {
      const year = month / 12;
      points.push({ year, contributed: input.initial + input.monthly * month, nominal,
        real: nominal / Math.pow(1 + input.inflation / 100, year) });
    }
  }
  const contributed = input.initial + input.monthly * months;
  return { points, contributed, nominal, gain: nominal - contributed,
    real: nominal / Math.pow(1 + input.inflation / 100, input.years),
    netAnnualReturn: (netAnnualFactor - 1) * 100 };
}