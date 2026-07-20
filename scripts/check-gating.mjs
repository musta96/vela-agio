#!/usr/bin/env node
/**
 * check-gating.mjs
 *
 * Static + DB coverage check for RouteFeatureGate. Fails the build when:
 *   1. A `<RouteFeatureGate feature="...">` in src/App.tsx uses a key that
 *      isn't in public.feature_catalog.
 *   2. That key doesn't appear in ANY plan's subscription_plans.feature_keys
 *      (i.e. nobody could ever unlock it — the route is permanently locked).
 *
 * Reads:
 *   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
 *
 * Usage:
 *   bun run check:gating
 *   node scripts/check-gating.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON) {
  console.error("[check-gating] Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY env vars.");
  process.exit(2);
}

function extractRouteFeatures() {
  const src = readFileSync(resolve(repoRoot, "src/App.tsx"), "utf8");
  const re = /<RouteFeatureGate\s+feature=["']([^"']+)["']/g;
  const keys = new Set();
  let m;
  while ((m = re.exec(src))) keys.add(m[1]);
  return [...keys].sort();
}

async function fetchTable(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

const routeFeatures = extractRouteFeatures();
const [catalog, plans] = await Promise.all([
  fetchTable("feature_catalog?select=key"),
  fetchTable("subscription_plans?select=slug,name,feature_keys"),
]);

const catalogKeys = new Set(catalog.map((r) => r.key));
const planKeys = new Set();
for (const p of plans) for (const k of p.feature_keys ?? []) planKeys.add(k);

const failures = [];
const rows = routeFeatures.map((key) => {
  const inCatalog = catalogKeys.has(key);
  const owners = plans.filter((p) => (p.feature_keys ?? []).includes(key)).map((p) => p.slug);
  const covered = owners.length > 0;
  if (!inCatalog) failures.push(`${key}: missing from feature_catalog`);
  if (!covered) failures.push(`${key}: not granted to any plan (no one can unlock it)`);
  return { key, inCatalog: inCatalog ? "✓" : "✗", plans: owners.join(",") || "—" };
});

console.log("\nRouteFeatureGate coverage (App.tsx → feature_catalog → subscription_plans)\n");
console.table(rows);

if (failures.length) {
  console.error("\n[check-gating] FAIL:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
console.log(`\n[check-gating] OK — ${routeFeatures.length} gated route features covered.`);