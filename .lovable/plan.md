# Thematic Deep-Dive

Let users pick or type a theme (AI chips, GLP-1, defence electronics, uranium, grid infra…) and get:
1. an AI-generated value-chain map (raw materials → components → manufacturers → distributors → end users),
2. a ranked list of listed companies across the chain — including deliberately included micro/small caps,
3. per-name fundamentals, sentiment, and a one-click path to the memo/timing engines already in the app.

## User surface

**New route `/explore/themes`** (added as a tab on the existing `/explore` hub, so it lives with the other discovery rails):

- Theme picker: 12 curated preset chips (AI infra, GLP-1, defence, nuclear/uranium, grid & transmission, cybersecurity, cloud data, robotics, space, EV supply chain, biotech gene therapy, quantum) + free-text input.
- Region + size filters: All / North America / Europe / Asia; and All / Large / Mid / Small & Micro (`marketCap < 2B`).
- "Discovery mode" toggle — when on, the ranker down-weights mega-caps and lifts small/unknown names with theme exposure.

Result page:
- **Value-chain diagram** (5 columns: Raw materials, Components, Manufacturers, Distributors/Integrators, End users) with company chips per node.
- **Ranked table**: symbol, name, chain segment, market cap, revenue growth, P/E, sentiment score, exposure tag ("pure-play" / "partial" / "adjacent").
- Row actions: Add to watchlist, Open in `/technical`, Generate research brief, Add to a portfolio memo.
- Sources footer (news / filings snippets used by the AI).

## Copilot integration

Register a `run_thematic_deepdive` tool: `{ theme: string, region?: string, size?: 'all'|'large'|'mid'|'small', discoveryMode?: boolean }`. Returns the same JSON as the edge function (chain + ranked candidates). Copilot uses it when the user asks things like "who benefits from GLP-1", "small caps riding AI power demand", "hidden names in defence electronics". The existing `run_screener` stays for objective-metric queries.

## Backend

**New edge function `thematic-deepdive`**:

1. **AI value-chain expansion** (Lovable AI, `google/gemini-3-flash-preview`, JSON mode). Prompt: "Given theme X, produce a value chain with 5 segments and 6–15 publicly-listed tickers per segment (Yahoo format, mix of global exchanges, include small/micro caps where relevant). For each company: segment, exposure tier (pure-play/partial/adjacent), one-line thesis." Zod-validate.
2. **Universe assembly**: dedupe tickers, cap at 60 per run to stay within fanout budget.
3. **Fundamentals + sentiment fanout**: reuse existing `nl-screener`'s Yahoo `fetchFundamentals` (extracted into a shared helper) and `analyze-sentiment` for a light sentiment score. Concurrency 5.
4. **Filters**: region (infer from exchange suffix), size band (`marketCap`), and drop tickers that fail to resolve.
5. **Ranking**: composite score = `w1·revGrowth + w2·(1/pe if pe>0) + w3·sentiment + w4·exposureBonus`. In Discovery mode, add a `-log10(marketCap)` term so smaller names rise. Deterministic tie-break by ticker.
6. **Return**: `{ theme, chain: Segment[], results: RankedCompany[], sources }`. Cache in `ai_output_cache` keyed on `(theme, region, size, discoveryMode)` for 24h to keep repeat requests cheap.

Gated behind the existing AI-access resolver (same pattern as `nl-screener`).

---

# Backlog — Should-have: Short selling & hedging

**Why it matters:** aggressive/professional investors need to express negative views and hedge long exposure. Without shorts, options and futures the platform can't cover pro-grade strategies.

**Phased rollout:**
1. **Short paper orders** — extend Alpaca sandbox flow to accept `side: "sell"` on non-owned positions; track borrow/short P&L in `paper_trades` and margin in `paper_cash`. Surface a "Short" toggle in the ticket UI.
2. **Options chain viewer** — new panel on `/technical` (and a card on `/explore`) fetching Yahoo/CBOE chain per ticker; show strikes, expiries, IV, and basic Greeks (delta, gamma, theta, vega) computed with a Black-Scholes helper in `src/lib/options/`.
3. **Futures viewer** — contract table for major commodities (CL, GC, NG, HG, ZC) and indices (ES, NQ, YM, RTY, VX) via Yahoo continuous contracts; front-month + calendar spread quick view.
4. **Copilot integration** — extend `place_paper_order` with `short_sell: true`; add `suggest_hedge(symbol, size)` tool returning a proposed put spread / short future overlay ranked by cost-to-hedge.

**Open questions:** margin model for shorts on the paper engine, IV surface data source (Yahoo has gaps), regulatory copy for EU users.

---

# Backlog — Should-have: Portfolio impact comparison

**Why it matters:** capital-allocation decisions are currently made in isolation. Investors need to see how a proposed strategy (memo, thematic deep-dive, screener output) interacts with what they already hold — overlap, risk shift, diversification delta, and how to rebalance around it.

**Scope:**
1. **Shared engine `src/lib/portfolio/impact.ts`** — pure functions that take `{ existing: Holding[], proposed: Allocation[] }` and compute: sector & geography overlap matrix, combined weights, combined β / vol / VaR (reuse `src/lib/quant/*`), Herfindahl-based diversification score before/after, and a rebalance suggestion that trims duplicated names to a target max weight.
2. **New edge function `portfolio-impact`** — wraps the engine, pulls existing holdings from `portfolio_holdings` for `auth.uid()`, accepts a proposed allocation payload, returns the full impact JSON (+ cache in `ai_output_cache` keyed on holdings hash + proposal hash).
3. **UI surface on `/rebalance`** — new "Impact vs current portfolio" panel: overlap heatmap (sector × source), before/after risk cards, diversification delta bar, and a rebalancing table with one-click "Apply suggestion".
4. **Memo integration** — extend `generate-memo-pdf` with an `include_existing_portfolio_comparison: true` flag that appends a "Portfolio fit" section (overlap chart, risk deltas, rebalance table) to the PDF and to the in-app memo preview.
5. **Copilot tool** — register `compare_portfolio_impact({ proposed })` returning the same JSON, and let the memo builder auto-invoke it when the user has holdings.

**Open questions:** how to represent proposed allocation (weights vs cash amounts vs share counts), whether to include broker-connected `broker_positions` alongside `portfolio_holdings`, and treatment of ETFs (look-through vs surface-level overlap).

## Files to add / edit

Add:
- `supabase/functions/thematic-deepdive/index.ts`
- `supabase/functions/_shared/fundamentals.ts` (extract Yahoo `fetchFundamentals` + `getCrumb` for reuse; refactor `nl-screener` to import from it)
- `src/lib/thematic/schema.ts` (Zod contract shared with the edge function response)
- `src/lib/thematic/client.ts` (`fetchThematicDeepDive`)
- `src/pages/ExploreThemes.tsx`
- `src/components/thematic/ValueChainDiagram.tsx`
- `src/components/thematic/ThemedResultsTable.tsx`
- `src/lib/thematic/__tests__/scoring.test.ts` (rank composition + Discovery-mode small-cap lift)

Edit:
- `src/App.tsx` — route `/explore/themes`
- `src/pages/Explore.tsx` — add a "Themes" tab entry
- `supabase/functions/copilot/index.ts` — register `run_thematic_deepdive` tool + executor
- `supabase/functions/nl-screener/index.ts` — import from shared fundamentals helper

## Out of scope

- Live revenue-exposure percentages per theme (would need paid filings data). We rely on the AI's exposure tier + a disclaimer.
- Auto-populated theme catalogue from news trends — v1 uses the curated 12 presets plus free-text.
- Backtesting the discovery output.

## Technical notes

- Reuse `resolveAiAccess` / `modelForCap` for gating and BYOK, same as `nl-screener`.
- No new tables — cache uses existing `ai_output_cache`.
- Value-chain diagram is a CSS grid of columns with badge cards — no external graph lib.
