#!/usr/bin/env node
/**
 * check-landing-parity.mjs
 *
 * Prints a diff report of missing / extra platform capabilities between:
 *   - src/data/platformCapabilities.ts  (source of truth)
 *   - src/data/landingDefaults.ts       (Landing Features grid)
 *   - src/pages/Features.tsx            (plan comparison matrix rows)
 *
 * Exits non-zero on any drift so CI blocks merges that break parity.
 * Reads pure source — no DB / network access — so it runs in every CI env.
 *
 * Usage:
 *   bun scripts/check-landing-parity.mjs
 *   node scripts/check-landing-parity.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

// --- 1. Parse PLATFORM_CAPABILITIES ---------------------------------------
const capSrc = read("src/data/platformCapabilities.ts");
const capabilities = [];
// Match each `{ id: "...", landingTitle: "...", matrixRowLabel: "...", ... }`.
const capRe = /\{\s*id:\s*"([^"]+)"\s*,\s*landingTitle:\s*"([^"]+)"\s*,\s*matrixRowLabel:\s*"([^"]+)"/g;
let m;
while ((m = capRe.exec(capSrc))) {
  capabilities.push({ id: m[1], landingTitle: m[2], matrixRowLabel: m[3] });
}

// --- 2. Parse landing feature titles -------------------------------------
const landingSrc = read("src/data/landingDefaults.ts");
// Locate the features items block, then extract every `title: "..."`.
const featuresBlock = landingSrc
  .split(/key:\s*"features"/)[1]
  ?.split(/key:\s*"audiences"/)[0] ?? "";
// Only pull titles from the `items: [ ... ]` array inside the features
// block, so the section headline/subtitle are not counted as cards.
const itemsBlock = featuresBlock.match(/items:\s*\[([\s\S]*?)\]\s*,?\s*\}/)?.[1] ?? "";
const landingTitles = new Set();
for (const t of itemsBlock.matchAll(/title:\s*"([^"]+)"/g)) landingTitles.add(t[1]);

// --- 3. Parse comparison matrix labels ------------------------------------
const featuresSrc = read("src/pages/Features.tsx");
const matrixLabels = new Set();
for (const t of featuresSrc.matchAll(/label:\s*"([^"]+)"\s*,/g)) matrixLabels.add(t[1]);

// --- 4. Diff -------------------------------------------------------------
const report = { missingLanding: [], missingMatrix: [], extraLanding: [] };

for (const cap of capabilities) {
  if (!landingTitles.has(cap.landingTitle)) {
    report.missingLanding.push(`${cap.id}: "${cap.landingTitle}"`);
  }
  if (!matrixLabels.has(cap.matrixRowLabel)) {
    report.missingMatrix.push(`${cap.id}: "${cap.matrixRowLabel}"`);
  }
}
const declared = new Set(capabilities.map((c) => c.landingTitle));
for (const t of landingTitles) {
  if (!declared.has(t)) report.extraLanding.push(t);
}

// --- 5. Print ------------------------------------------------------------
const rd = "\x1b[31m", gr = "\x1b[32m", ye = "\x1b[33m", rs = "\x1b[0m";
console.log(`[landing-parity] capabilities declared: ${capabilities.length}`);
console.log(`[landing-parity] landing grid cards:   ${landingTitles.size}`);
console.log(`[landing-parity] matrix row labels:    ${matrixLabels.size}`);

let fail = false;
if (report.missingLanding.length) {
  fail = true;
  console.log(`\n${rd}MISSING LANDING CARDS${rs} (declared in PLATFORM_CAPABILITIES, absent from Landing grid):`);
  for (const l of report.missingLanding) console.log(`  - ${l}`);
}
if (report.missingMatrix.length) {
  fail = true;
  console.log(`\n${rd}MISSING MATRIX ROWS${rs} (declared in PLATFORM_CAPABILITIES, absent from comparison matrix):`);
  for (const l of report.missingMatrix) console.log(`  - ${l}`);
}
if (report.extraLanding.length) {
  fail = true;
  console.log(`\n${ye}EXTRA LANDING CARDS${rs} (present on Landing grid but not declared in PLATFORM_CAPABILITIES):`);
  for (const l of report.extraLanding) console.log(`  - ${l}`);
}

if (fail) {
  console.log(`\n${rd}❌ Landing / matrix parity drift detected.${rs}`);
  process.exit(1);
} else {
  console.log(`\n${gr}✅ Landing and comparison matrix are in parity with PLATFORM_CAPABILITIES.${rs}`);
}
