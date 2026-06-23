
## Goal

Replace the current client-side memo generators with a server-rendered, token-driven PDF system for Vela. Two memo types (portfolio, strategy), shared design language, strict fallback rules so no empty field, dash, or proxy correlation ever reaches the page.

## Architecture

```text
client (Portfolio, CopilotChat, PortfolioMemoBuilder)
  │  POST { memo_type, meta, cover, summary, ... }
  ▼
edge function: generate-memo-pdf
  ├─ validate JSON (Zod, schema below)
  ├─ apply fallback rules (drop empty fields, omit sections)
  ├─ sanitize prose (strip em dashes, banned words, fix casing)
  ├─ render HTML from token-driven template
  ├─ launch headless Chromium via @sparticuz/chromium + puppeteer-core
  └─ return application/pdf (base64 in JSON or binary)
```

Headless Chromium in Deno edge runtime is fragile. We use **Browserless / `puppeteer-core` against a remote endpoint** when a `BROWSERLESS_URL` secret is present, otherwise fall back to **`@sparticuz/chromium` + `puppeteer-core` via esm.sh**. The user will be prompted for the Browserless token if they want hosted rendering; otherwise the bundled chromium binary path is used.

Because Deno's edge runtime cannot reliably run headless Chrome, the realistic shipping path is: render HTML on the server, send it to a Puppeteer microservice. We expose an `add_secret` ask for `BROWSERLESS_API_KEY`. If absent, the function returns the rendered HTML plus a print-ready CSS payload that the browser prints to PDF via `window.print()` (still single source of truth, still server-rendered HTML, no client templating).

## Files

New
- `src/lib/memo/tokens.ts` — exact tokens from spec, frozen.
- `src/lib/memo/schema.ts` — Zod schema for the input contract.
- `src/lib/memo/sanitizeProse.ts` — em-dash, banned-word, casing rules.
- `src/lib/memo/fallbacks.ts` — drop-empty + section-omit logic + omission log.
- `src/lib/memo/format.ts` — number/currency/percent rounding helpers.
- `src/lib/memo/template.ts` — HTML/CSS template builder, all components.
- `src/lib/memo/components/` — `cover.ts`, `header.ts`, `footer.ts`, `marquee.ts`, `strip.ts`, `dataTable.ts`, `severityBar.ts`, `corrMatrix.ts`, `instrumentBlock.ts`, `disclosureBox.ts`.
- `supabase/functions/generate-memo-pdf/index.ts` — edge function (Zod validate, build HTML, call Browserless or return HTML).
- `src/lib/memo/client.ts` — thin client: `requestMemoPdf(input)` invokes the function and triggers download.
- `src/lib/__tests__/memo.sanitize.test.ts`, `memo.fallbacks.test.ts`, `memo.template.snapshot.test.ts`.

Edited
- `src/components/PortfolioMemoBuilder.tsx` — call `requestMemoPdf` instead of `generatePortfolioMemo`.
- `src/components/CopilotChat.tsx` — same swap.
- `src/pages/Portfolio.tsx` — same swap for `generatePortfolioInvestmentMemo`.

Deprecated (left in tree but no longer imported)
- `src/lib/investmentMemoPdf.ts`, `src/lib/portfolioInvestmentMemoPdf.ts`, `src/lib/generatePortfolioMemo.ts`. We keep them one release for safety; remove next pass.

## Component build order

1. tokens.ts (verbatim from spec)
2. format + sanitizeProse + fallbacks (pure, unit-tested)
3. schema (Zod) — every block optional except `memo_type` and `meta.title`
4. component renderers (HTML strings, all styles inline-from-tokens)
5. template assembler — branches on `memo_type`, runs fallbacks, emits one HTML doc
6. edge function — POST handler, returns `{ pdf_base64 }` or `{ html }` if no chromium
7. client `requestMemoPdf` — calls function, triggers download with `meta.title` filename
8. swap call sites in three components
9. tests

## Data-integrity rules — implementation

- **Marquee**: filter null/empty cells before render; CSS grid `repeat(n, 1fr)` with n = filtered length, never 4 fixed cells.
- **Per-instrument metric slot**: `pickInstrumentMetric()` resolves to `target` → `fair_value` → `expected_return_band` → `ter` → `tracking_difference`. Returns `null` if none, slot omitted.
- **Geography**: only render rows from `geography_lookthrough`. If absent for a holding, holding contributes to a single "Global / diversified" bucket; never falls back to listing country.
- **Sectors**: render only rows with non-null GICS sector; show "Covered: x% of NAV" footnote. If covered < 30%, omit chart and show note.
- **Correlation**: require `correlation.method === "pearson_log_*"` and full square matrix. Otherwise omit section with note "Requires return history".
- **Diversification**: single headline `verdict`, then axes table. Never per-axis verdicts in the heading.
- **Numbers**: `pct(x, 1)`, `pctInt(x)`, `money(x, ccy)` thousands-sep, `int(x)`.

## Writing-style sanitizer

`sanitizeProse(text)`:
- Replace ` — `, `—`, ` – ` (when between words) with `. ` or `, `.
- Replace en dashes between numbers with hyphen-minus only if not a range; ranges preserved.
- Banned-word regex list (case-insensitive, word-boundary) → throws in dev, silently drops sentence containing it in prod (logged via omission log).
- Force sentence case on any string passed through `heading()` helper.
- Applied to all JSON-supplied prose AND template static copy.

## Components (token-driven, no hardcoded hex)

All components import `tokens` and reference `tokens.color.navy`, `tokens.size.h1`, etc. CSS generated as inline `<style>` block at top of HTML using tokens; nothing in component HTML carries literal colors.

Cover: full-bleed `tokens.color.navy`, marquee band `tokens.color.navyDeep` height 96pt, stat label `tokens.size.label` mono uppercase with `tokens.tracking.label`, value `tokens.size.coverTitle * 0.5`.

Running header/footer use `@page` margins + `position: running()` (Paged.js polyfill loaded from esm.sh inside the HTML so headers repeat across pages when Chromium prints).

Per-instrument block wrapped in `break-inside: avoid;` for keep-together. After every 3rd instrument inject `<div style="break-after: page"></div>`.

Correlation matrix cells: lookup color via `tokens.color.corr[Math.min(4, Math.floor(Math.abs(v) * 5))]`.

Disclosure box: `border-left: ${tokens.rule.disclosureLeft}pt solid ${tokens.color.gold}`, `border-radius: 0`.

## Acceptance harness

`memo.template.snapshot.test.ts` runs the renderer on three fixtures (portfolio full, portfolio sparse, strategy) and asserts:
- No `—`, no `–` followed by space-letter, no banned word in output HTML.
- No `<td>—</td>` or empty marquee cell.
- Every section heading has a non-empty sibling.
- Every inline style attribute's color matches a token value (regex check against the tokens map).
- For sparse fixture, omitted sections logged but no heading rendered.

## Secrets

Will request `BROWSERLESS_API_KEY` via `add_secret`. If user declines, the function still returns server-rendered HTML and the client opens a hidden iframe and calls `print()`; same template, same tokens, same output, just printed locally. The acceptance rules still apply because the HTML is server-rendered.

## Out of scope (this pass)

- Removing the deprecated generators (next cleanup PR).
- Charts beyond severity bars and correlation heatmap (sector pie deferred unless data-shape allows it without an empty-state).
- i18n of memo body (engine output is passed through as-is after sanitization).
