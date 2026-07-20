/**
 * Integration test: every routed capability declared in the source of
 * truth resolves to a real route in App.tsx, and any capability marked
 * as gated shares the SAME feature key that RouteFeatureGate enforces.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLATFORM_CAPABILITIES } from "@/data/platformCapabilities";
import { ROUTE_FEATURE_MAP } from "@/lib/gating/routeFeatureMap";

const appSrc = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

/** Extract all `<Route path="...">` declarations from App.tsx. */
const declaredRoutes = new Set<string>();
for (const m of appSrc.matchAll(/<Route\s+path=["']([^"']+)["']/g)) {
  declaredRoutes.add(m[1]);
}

/** Extract `<RouteFeatureGate feature="...">` next to each route path. */
const routeGates = new Map<string, string>();
const routeRe = /<Route\s+path=["']([^"']+)["'][^>]*>[\s\S]{0,200}?<RouteFeatureGate\s+feature=["']([^"']+)["']/g;
for (const m of appSrc.matchAll(routeRe)) {
  routeGates.set(m[1], m[2]);
}

describe("platformCapabilities → App.tsx routes & gating", () => {
  it("every capability route resolves to a declared <Route> path", () => {
    const missing = PLATFORM_CAPABILITIES
      .filter((c) => c.route)
      .filter((c) => {
        const path = c.route!;
        // Accept exact match or parent-of-nested (e.g. /options → /options/:sym)
        if (declaredRoutes.has(path)) return false;
        for (const r of declaredRoutes) if (r.startsWith(path + "/") || r === path) return false;
        return true;
      })
      .map((c) => `${c.id} → ${c.route}`);
    expect(missing, `Landing links to unrouted paths:\n${missing.join("\n")}`).toEqual([]);
  });

  it("gated capabilities enforce the SAME feature key at the Route level", () => {
    const mismatches: string[] = [];
    for (const cap of PLATFORM_CAPABILITIES) {
      if (!cap.route || !cap.featureKey) continue;
      const routeKey = routeGates.get(cap.route);
      if (routeKey && routeKey !== cap.featureKey) {
        mismatches.push(
          `${cap.id}: <Route ${cap.route}> gates on "${routeKey}" but capability declares "${cap.featureKey}"`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("ROUTE_FEATURE_MAP and capability featureKeys never contradict", () => {
    const mismatches: string[] = [];
    for (const cap of PLATFORM_CAPABILITIES) {
      if (!cap.route || !cap.featureKey) continue;
      const canonical = ROUTE_FEATURE_MAP[cap.route];
      if (canonical && canonical !== cap.featureKey) {
        mismatches.push(
          `${cap.id}: ROUTE_FEATURE_MAP[${cap.route}]="${canonical}" vs capability="${cap.featureKey}"`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("every ungated capability route is publicly reachable (no gate wrap)", () => {
    const unexpected: string[] = [];
    for (const cap of PLATFORM_CAPABILITIES) {
      if (!cap.route || cap.featureKey) continue;
      if (routeGates.has(cap.route)) {
        unexpected.push(`${cap.id}: ${cap.route} is gated by "${routeGates.get(cap.route)}" but capability has no featureKey`);
      }
    }
    expect(unexpected).toEqual([]);
  });
});
