import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  recordGatingMismatch,
  onGatingMismatch,
  getRecentGatingMismatches,
  __resetGatingTelemetryForTests,
  type GatingMismatchEvent,
} from "@/lib/gating/telemetry";

beforeEach(() => {
  __resetGatingTelemetryForTests();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("gating telemetry", () => {
  it("records pathname, expected, and received feature on each mismatch", () => {
    const seen: GatingMismatchEvent[] = [];
    onGatingMismatch((ev) => seen.push(ev));

    recordGatingMismatch({
      pathname: "/simulations",
      expectedFeature: "portfolio.simulations",
      receivedFeature: "dealflow.access",
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      pathname: "/simulations",
      expectedFeature: "portfolio.simulations",
      receivedFeature: "dealflow.access",
    });
    expect(typeof seen[0].timestamp).toBe("number");
  });

  it("dedupes identical mismatches within the dedupe window", () => {
    const seen: GatingMismatchEvent[] = [];
    onGatingMismatch((ev) => seen.push(ev));

    const input = {
      pathname: "/quant",
      expectedFeature: "quant.alpha",
      receivedFeature: "dealflow.access",
    };
    recordGatingMismatch(input);
    recordGatingMismatch(input);
    recordGatingMismatch(input);
    expect(seen).toHaveLength(1);
  });

  it("does not dedupe across distinct (pathname, expected, received) tuples", () => {
    const seen: GatingMismatchEvent[] = [];
    onGatingMismatch((ev) => seen.push(ev));

    recordGatingMismatch({ pathname: "/a", expectedFeature: "x", receivedFeature: "y" });
    recordGatingMismatch({ pathname: "/b", expectedFeature: "x", receivedFeature: "y" });
    recordGatingMismatch({ pathname: "/a", expectedFeature: "x", receivedFeature: "z" });
    expect(seen).toHaveLength(3);
  });

  it("exposes recent events for admin/monitoring surfaces", () => {
    recordGatingMismatch({ pathname: "/x", expectedFeature: "a", receivedFeature: "b" });
    const recent = getRecentGatingMismatches();
    expect(recent).toHaveLength(1);
    expect(recent[0].pathname).toBe("/x");
  });

  it("dispatches a window CustomEvent so external observability can subscribe", () => {
    const handler = vi.fn();
    window.addEventListener("vela:gating-mismatch", handler as EventListener);
    recordGatingMismatch({
      pathname: "/optimizer",
      expectedFeature: "portfolio.optimizer",
      receivedFeature: "portfolio.rebalance",
    });
    window.removeEventListener("vela:gating-mismatch", handler as EventListener);
    expect(handler).toHaveBeenCalledTimes(1);
    const ev = handler.mock.calls[0][0] as CustomEvent<GatingMismatchEvent>;
    expect(ev.detail.pathname).toBe("/optimizer");
    expect(ev.detail.expectedFeature).toBe("portfolio.optimizer");
    expect(ev.detail.receivedFeature).toBe("portfolio.rebalance");
  });

  it("logger failures do not break the caller", () => {
    onGatingMismatch(() => { throw new Error("boom"); });
    expect(() =>
      recordGatingMismatch({ pathname: "/p", expectedFeature: "a", receivedFeature: "b" }),
    ).not.toThrow();
  });
});