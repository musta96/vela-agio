/**
 * Rate limiting + sampling tests for gating telemetry.
 *
 * The public contract these tests pin:
 *  1. Dedupe holds under load — even when the caller fires thousands of
 *     identical mismatches per second, the sink only sees one per
 *     `dedupeMs` window.
 *  2. A fixed-window rate limit caps the number of *distinct* mismatches
 *     that can escape per window, so an incident that leaks every gated
 *     route at once can't drown the observability pipeline.
 *  3. A configurable probabilistic sampler further reduces volume; with
 *     a seeded RNG the emitted count is statistically bounded.
 *  4. Suppression is observable: `getGatingTelemetryCounters` exposes how
 *     many events were dropped by each stage.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  recordGatingMismatch,
  onGatingMismatch,
  configureGatingTelemetry,
  getGatingTelemetryCounters,
  __resetGatingTelemetryForTests,
  type GatingMismatchEvent,
} from "@/lib/gating/telemetry";

beforeEach(() => {
  __resetGatingTelemetryForTests();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("gating telemetry — dedupe under load", () => {
  it("collapses 10k identical mismatches into a single emitted event", () => {
    const seen: GatingMismatchEvent[] = [];
    onGatingMismatch((ev) => seen.push(ev));

    // Raise the rate-limit ceiling above the burst so we're isolating the
    // dedupe behaviour, not accidentally testing the limiter.
    configureGatingTelemetry({ maxEventsPerWindow: 100_000 });

    const input = {
      pathname: "/simulations",
      expectedFeature: "portfolio.simulations",
      receivedFeature: "dealflow.access",
    };
    for (let i = 0; i < 10_000; i++) recordGatingMismatch(input);

    expect(seen).toHaveLength(1);
    const c = getGatingTelemetryCounters();
    expect(c.attempted).toBe(10_000);
    expect(c.emitted).toBe(1);
    expect(c.suppressedByDedupe).toBe(9_999);
  });

  it("keeps deduping when many distinct tuples are interleaved", () => {
    const seen: GatingMismatchEvent[] = [];
    onGatingMismatch((ev) => seen.push(ev));
    configureGatingTelemetry({ maxEventsPerWindow: 100_000 });

    const routes = [
      { pathname: "/a", expectedFeature: "x", receivedFeature: "y" },
      { pathname: "/b", expectedFeature: "x", receivedFeature: "y" },
      { pathname: "/c", expectedFeature: "x", receivedFeature: "y" },
    ];
    // Interleave 1k iterations across the three distinct tuples.
    for (let i = 0; i < 1_000; i++) {
      for (const r of routes) recordGatingMismatch(r);
    }

    expect(seen).toHaveLength(3);
    const paths = new Set(seen.map((e) => e.pathname));
    expect(paths).toEqual(new Set(["/a", "/b", "/c"]));
    expect(getGatingTelemetryCounters().suppressedByDedupe).toBe(3_000 - 3);
  });
});

describe("gating telemetry — rate limit", () => {
  it("caps emitted events per window regardless of distinct tuples", () => {
    const seen: GatingMismatchEvent[] = [];
    onGatingMismatch((ev) => seen.push(ev));
    configureGatingTelemetry({ maxEventsPerWindow: 5, sampleRate: 1 });

    // 50 unique tuples, all in the same second — none share a dedupe key.
    for (let i = 0; i < 50; i++) {
      recordGatingMismatch({
        pathname: `/r${i}`,
        expectedFeature: `exp.${i}`,
        receivedFeature: `rcv.${i}`,
      });
    }

    expect(seen).toHaveLength(5);
    const c = getGatingTelemetryCounters();
    expect(c.emitted).toBe(5);
    expect(c.suppressedByRateLimit).toBe(45);
    expect(c.suppressedByDedupe).toBe(0);
  });

  it("refills the budget on the next window", () => {
    vi.useFakeTimers();
    try {
      const seen: GatingMismatchEvent[] = [];
      onGatingMismatch((ev) => seen.push(ev));
      configureGatingTelemetry({ maxEventsPerWindow: 2, rateWindowMs: 1_000 });

      vi.setSystemTime(new Date("2026-07-20T00:00:00Z"));
      for (let i = 0; i < 10; i++) {
        recordGatingMismatch({
          pathname: `/r${i}`,
          expectedFeature: "e",
          receivedFeature: "r",
        });
      }
      expect(seen).toHaveLength(2);

      // Advance past the window and fire again — the budget resets.
      vi.setSystemTime(new Date("2026-07-20T00:00:02Z"));
      for (let i = 100; i < 110; i++) {
        recordGatingMismatch({
          pathname: `/r${i}`,
          expectedFeature: "e",
          receivedFeature: "r",
        });
      }
      expect(seen).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("gating telemetry — probabilistic sampling", () => {
  it("drops non-sampled events even when dedupe and rate limit would allow them", () => {
    const seen: GatingMismatchEvent[] = [];
    onGatingMismatch((ev) => seen.push(ev));

    // Deterministic RNG: emit on even calls, drop on odd calls.
    let n = 0;
    configureGatingTelemetry({
      sampleRate: 0.5,
      maxEventsPerWindow: 1_000,
      random: () => (n++ % 2 === 0 ? 0 : 0.99),
    });

    for (let i = 0; i < 100; i++) {
      recordGatingMismatch({
        pathname: `/r${i}`,
        expectedFeature: "e",
        receivedFeature: "r",
      });
    }

    // 100 attempted, alternating RNG → exactly 50 emitted.
    expect(seen).toHaveLength(50);
    const c = getGatingTelemetryCounters();
    expect(c.suppressedBySample).toBe(50);
    expect(c.emitted).toBe(50);
  });

  it("sampleRate=0 suppresses everything (kill switch)", () => {
    const seen: GatingMismatchEvent[] = [];
    onGatingMismatch((ev) => seen.push(ev));
    configureGatingTelemetry({ sampleRate: 0 });

    for (let i = 0; i < 20; i++) {
      recordGatingMismatch({
        pathname: `/r${i}`,
        expectedFeature: "e",
        receivedFeature: "r",
      });
    }
    expect(seen).toHaveLength(0);
    expect(getGatingTelemetryCounters().suppressedBySample).toBe(20);
  });
});

describe("gating telemetry — combined pipeline under load", () => {
  it("holds: dedupe → sample → rate limit, in that order", () => {
    const seen: GatingMismatchEvent[] = [];
    onGatingMismatch((ev) => seen.push(ev));

    // Sampler always passes so we isolate rate-limit vs dedupe.
    configureGatingTelemetry({
      sampleRate: 1,
      maxEventsPerWindow: 3,
      random: () => 0,
    });

    // Fire 1000 events split across two tuples. Dedupe collapses each
    // tuple to a single emitted event, well under the rate limit.
    const A = { pathname: "/a", expectedFeature: "x", receivedFeature: "y" };
    const B = { pathname: "/b", expectedFeature: "x", receivedFeature: "y" };
    for (let i = 0; i < 500; i++) {
      recordGatingMismatch(A);
      recordGatingMismatch(B);
    }
    expect(seen).toHaveLength(2);

    const c = getGatingTelemetryCounters();
    expect(c.emitted).toBe(2);
    expect(c.suppressedByDedupe).toBe(998);
    expect(c.suppressedByRateLimit).toBe(0);
  });
});