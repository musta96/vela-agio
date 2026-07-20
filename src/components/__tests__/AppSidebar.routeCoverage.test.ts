/**
 * Guarantees the sidebar and the canonical gating map stay in lockstep:
 *
 *  1. Every Pro-gated route in ROUTE_FEATURE_MAP must be reachable from
 *     the sidebar (either as a NavItemLink `url` or a group `url`).
 *  2. Every locked sidebar URL declared in AppSidebar's `ITEM_FEATURE_KEY`
 *     must resolve to a feature key that is also declared in
 *     ROUTE_FEATURE_MAP (either directly, or as an alias mapping to the
 *     same feature key — e.g. `/api`, `/api-docs`, `/agent-integrations`
 *     all share `enterprise.api`).
 *
 * These two invariants together prevent the "gated route exists but has
 * no sidebar entry" drift and its inverse ("sidebar lists a locked link
 * to a route the gate doesn't know about").
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROUTE_FEATURE_MAP } from "@/lib/gating/routeFeatureMap";

const SIDEBAR_PATH = resolve(process.cwd(), "src/components/AppSidebar.tsx");
const SRC = readFileSync(SIDEBAR_PATH, "utf8");

/** Extract every `url: "/…"` literal declared in AppSidebar.tsx. */
function extractSidebarUrls(src: string): Set<string> {
  const urls = new Set<string>();
  const re = /url:\s*"(\/[^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) urls.add(m[1]);
  return urls;
}

/** Extract the ITEM_FEATURE_KEY map declared in AppSidebar.tsx. */
function extractItemFeatureKey(src: string): Record<string, string> {
  const start = src.indexOf("const ITEM_FEATURE_KEY");
  expect(start).toBeGreaterThan(-1);
  const open = src.indexOf("{", start);
  const close = src.indexOf("};", open);
  const body = src.slice(open + 1, close);
  const out: Record<string, string> = {};
  const re = /"([^"]+)"\s*:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out[m[1]] = m[2];
  return out;
}

const SIDEBAR_URLS = extractSidebarUrls(SRC);
const ITEM_FEATURE_KEY = extractItemFeatureKey(SRC);

describe("Sidebar ↔ ROUTE_FEATURE_MAP coverage", () => {
  it("every gated route in ROUTE_FEATURE_MAP has a sidebar entry", () => {
    const missing: string[] = [];
    for (const path of Object.keys(ROUTE_FEATURE_MAP)) {
      if (!SIDEBAR_URLS.has(path)) missing.push(path);
    }
    expect(
      missing,
      `Routes present in ROUTE_FEATURE_MAP but with no matching sidebar url:\n  ${missing.join("\n  ")}`,
    ).toEqual([]);
  });

  it("every locked sidebar item maps to a feature key ROUTE_FEATURE_MAP knows", () => {
    // Reverse-map the canonical routeFeatureMap so we can accept aliases.
    const knownFeatureKeys = new Set(Object.values(ROUTE_FEATURE_MAP));
    const stray: Array<{ url: string; key: string }> = [];
    for (const [url, key] of Object.entries(ITEM_FEATURE_KEY)) {
      if (!knownFeatureKeys.has(key)) stray.push({ url, key });
    }
    expect(
      stray,
      `Sidebar declares locked items whose feature key is not in ROUTE_FEATURE_MAP:\n  ${stray
        .map((s) => `${s.url} → ${s.key}`)
        .join("\n  ")}`,
    ).toEqual([]);
  });

  it("each locked sidebar url is either canonical in ROUTE_FEATURE_MAP or a documented alias", () => {
    // A locked url is a "documented alias" when it's not itself a key in
    // ROUTE_FEATURE_MAP, but its feature key IS the canonical key of some
    // other route that IS in ROUTE_FEATURE_MAP. This is what /api-docs
    // and /agent-integrations do (they share enterprise.api with /api).
    const undocumented: string[] = [];
    for (const [url, key] of Object.entries(ITEM_FEATURE_KEY)) {
      if (ROUTE_FEATURE_MAP[url] === key) continue; // canonical match
      // Alias case: some other path in the map has this key.
      const isAlias = Object.entries(ROUTE_FEATURE_MAP).some(
        ([r, k]) => k === key && r !== url,
      );
      if (!isAlias) undocumented.push(`${url} → ${key}`);
    }
    expect(
      undocumented,
      `Sidebar has locked items that are neither canonical nor alias entries of ROUTE_FEATURE_MAP:\n  ${undocumented.join("\n  ")}`,
    ).toEqual([]);
  });
});