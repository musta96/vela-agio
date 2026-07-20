#!/usr/bin/env node
/**
 * report-plan-features.mjs
 *
 * One-click post-migration report: prints every subscription plan's slug,
 * name, and feature_keys. Highlights which "premium" feature keys used by
 * RouteFeatureGate in src/App.tsx are present on each plan.
 *
 * Run this after every migration that touches subscription_plans or
 * feature_catalog to confirm the intended plans got the intended keys.
 *
 * Reads: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
 * Usage: bun run report:plan-features
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
  console.error("[report-plan-features] Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY.");
  process.exit(2);
}

const src = readFileSync(resolve(repoRoot, "src/App.tsx"), "utf8");
const premium = [
  ...new Set([...src.matchAll(/<RouteFeatureGate\s+feature=["']([^"']+)["']/g)].map((m) => m[1])),
].sort();

const res = await fetch(
  `${SUPABASE_URL}/rest/v1/subscription_plans?select=slug,name,tier,feature_keys&order=monthly_price_cents.asc.nullsfirst`,
  { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } },
);
if (!res.ok) {
  console.error(`[report-plan-features] fetch failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const plans = await res.json();

console.log("\nPremium feature keys (from RouteFeatureGate in src/App.tsx):");
console.log("  " + premium.join(", ") + "\n");

const matrix = plans.map((p) => {
  const row = { slug: p.slug, name: p.name, tier: p.tier };
  for (const k of premium) row[k] = (p.feature_keys ?? []).includes(k) ? "✓" : "·";
  return row;
});
console.table(matrix);

console.log("\nRaw feature_keys per plan:");
for (const p of plans) {
  const keys = (p.feature_keys ?? []).slice().sort();
  console.log(`  ${p.slug.padEnd(14)} (${p.tier}) → ${keys.length ? keys.join(", ") : "(none)"}`);
}