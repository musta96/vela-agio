import { describe, it, expect } from "vitest";
import { withCorrelationSensitivity } from "../adapter";

const RISK_PROFILES = ["conservative", "moderate", "balanced", "growth", "aggressive"] as const;
const REGIMES = [
  "Late-cycle, disinflation",
  "Risk-off / recession",
  "Inflation re-acceleration",
  undefined,
] as const;

const EXPECTED_DELTA_REGIMES = [
  "Risk-off / recession",
  "Inflation re-acceleration",
  "Liquidity shock",
];

describe("withCorrelationSensitivity", () => {
  for (const rp of RISK_PROFILES) {
    for (const regime of REGIMES) {
      it(`emits sensitivity + regime-delta table for risk=${rp}, regime=${regime ?? "none"}`, () => {
        const out = withCorrelationSensitivity(
          { diversifying: [{ a: "AAA", b: "BBB", v: -0.1 }] },
          { riskProfile: rp, regime, hasCorrelation: true },
        );
        expect(out?.sensitivity).toBeDefined();
        expect(out?.sensitivity?.paragraphs?.length ?? 0).toBeGreaterThanOrEqual(3);

        const deltas = out?.sensitivity?.regime_deltas ?? [];
        expect(deltas).toHaveLength(EXPECTED_DELTA_REGIMES.length);
        for (const label of EXPECTED_DELTA_REGIMES) {
          const row = deltas.find((d) => d.regime === label);
          expect(row, `missing regime-delta row "${label}"`).toBeDefined();
          expect(row!.note.length).toBeGreaterThan(20);
        }

        const risk = out?.sensitivity?.paragraphs?.[1] ?? "";
        if (rp === "growth" || rp === "aggressive" || rp === "conservative" || rp === "moderate") {
          expect(risk.toLowerCase()).toContain(rp);
        }

        if (regime) {
          const macroPara = out?.sensitivity?.paragraphs?.[2] ?? "";
          expect(macroPara).toContain(regime);
        }
      });
    }
  }

  it("preserves caller-supplied sensitivity payload", () => {
    const custom = { paragraphs: ["custom"], regime_deltas: [{ regime: "X", note: "Y" }] };
    const out = withCorrelationSensitivity(
      { diversifying: [{ a: "A", b: "B", v: 0 }], sensitivity: custom },
      { riskProfile: "balanced", regime: "any", hasCorrelation: true },
    );
    expect(out?.sensitivity).toEqual(custom);
  });

  it("returns the base payload untouched when there is no correlation data", () => {
    const out = withCorrelationSensitivity(undefined, { hasCorrelation: false });
    expect(out).toBeUndefined();
  });
});