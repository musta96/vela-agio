import { describe, it, expect, beforeEach } from "vitest";
import {
  bootstrapMonteCarlo,
  bootstrapMonteCarloCached,
  fingerprintReturns,
  __resetMonteCarloCache,
  __monteCarloCacheSize,
} from "@/lib/bootstrapMonteCarlo";
import { quantile } from "@/lib/quantScenarios";

/**
 * Deterministic fixtures: with the seeded Mulberry32 PRNG, identical inputs
 * must always yield byte-identical terminal-value distributions. This guards
 * the Backtest Quantitative Analysis panel against silent regressions in the
 * Monte Carlo engine that would otherwise only surface as visual drift in
 * the histogram / percentile tiles.
 */
describe("bootstrapMonteCarlo", () => {
  beforeEach(() => __resetMonteCarloCache());

  const rets = Array.from({ length: 100 }, (_, i) => Math.sin(i) * 0.01);

  it("returns empty result for invalid inputs", () => {
    expect(bootstrapMonteCarlo([], 100, 30, 100).finals).toEqual([]);
    expect(bootstrapMonteCarlo(rets, 0, 30, 100).finals).toEqual([]);
    expect(bootstrapMonteCarlo(rets, 100, 0, 100).finals).toEqual([]);
  });

  it("is deterministic across runs with the same seed", () => {
    const a = bootstrapMonteCarlo(rets, 1000, 60, 250, 42);
    const b = bootstrapMonteCarlo(rets, 1000, 60, 250, 42);
    expect(a.finals).toEqual(b.finals);
    expect(a.fan).toEqual(b.fan);
  });

  it("produces a sane percentile ordering (P05 ≤ P50 ≤ P95)", () => {
    const { finals, fan } = bootstrapMonteCarlo(rets, 1000, 60, 500, 7);
    expect(finals.length).toBe(500);
    expect(fan[0].step).toBe(0);
    fan.forEach((p) => {
      expect(p.p05).toBeLessThanOrEqual(p.p50);
      expect(p.p50).toBeLessThanOrEqual(p.p95);
    });
    const p50 = quantile(finals, 0.5);
    expect(p50).toBeGreaterThan(0);
  });

  it("changes when inputs change", () => {
    const a = bootstrapMonteCarlo(rets, 1000, 60, 250, 42);
    const b = bootstrapMonteCarlo(rets, 1000, 60, 250, 43);
    expect(a.finals).not.toEqual(b.finals);
  });
});

describe("bootstrapMonteCarloCached", () => {
  beforeEach(() => __resetMonteCarloCache());

  const rets = Array.from({ length: 100 }, (_, i) => Math.cos(i) * 0.012);

  it("returns the same object reference for identical inputs", () => {
    const first = bootstrapMonteCarloCached(rets, 1000, 60, 300);
    const second = bootstrapMonteCarloCached(rets, 1000, 60, 300);
    expect(second).toBe(first);
    expect(__monteCarloCacheSize()).toBe(1);
  });

  it("creates separate cache entries when params differ", () => {
    bootstrapMonteCarloCached(rets, 1000, 60, 300);
    bootstrapMonteCarloCached(rets, 1000, 60, 400);
    bootstrapMonteCarloCached(rets, 2000, 60, 300);
    expect(__monteCarloCacheSize()).toBe(3);
  });

  it("matches the uncached implementation byte-for-byte", () => {
    const cached = bootstrapMonteCarloCached(rets, 1000, 60, 200, 11);
    const raw = bootstrapMonteCarlo(rets, 1000, 60, 200, 11);
    expect(cached.finals).toEqual(raw.finals);
  });
});

describe("fingerprintReturns", () => {
  it("is stable for identical input", () => {
    const rets = [0.01, -0.02, 0.005, 0.03];
    expect(fingerprintReturns(rets)).toBe(fingerprintReturns([...rets]));
  });
  it("differs for different content", () => {
    expect(fingerprintReturns([0.01, 0.02])).not.toBe(fingerprintReturns([0.01, 0.03]));
  });
  it("encodes empty inputs", () => {
    expect(fingerprintReturns([])).toBe("0");
  });
});