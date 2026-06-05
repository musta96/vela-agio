## Vela.ai Master Fix & Upgrade — Execution Plan

This is a large, multi-week scope. I'll deliver it in strict phases per your instruction: Sections 1–3 first and verified before touching 4–5. Below is what each phase changes, in what order, and how I'll verify it before moving on.

---

### Phase 1 — Critical data & logic bugs (blocking)

**1.1 Single portfolio source of truth**
- New `src/hooks/usePortfolio.tsx` (context + provider) that loads holdings once via Supabase, exposes: `holdings`, `marketValue`, `costBasis`, `unrealisedPnL`, `winners/losers/flat/noPrice`, `loading`, `refresh`.
- Wraps `App.tsx` alongside `PortfoliosProvider`.
- Refactor consumers to read from it: `Dashboard` (Home), `Portfolio`, `Risk`, `TaxHarvest`, `NetWorth`, Portfolio Coach.
- Delete the per-page `supabase.from("portfolio_holdings")` fetches in those pages.

**1.2 Reconcile totals**
- Define exactly two numbers in the hook: `marketValue = Σ shares × livePrice(fallback avg_price)` and `costBasis = Σ shares × avg_price`.
- Header total, position rows, and Performance chart's "current value" all bind to `marketValue`. Cost-basis line clearly labeled.
- Add an assertion in dev: `Math.abs(headerTotal − Σ positionTotals) < 0.01`.

**1.3 MiFID II suitability engine (highest priority)**
- Rewrite `src/lib/suitability.ts` as a pure deterministic module:
  - `MAX_SCORE`, `TOTAL_QUESTIONS` constants.
  - `computeSuitability(answers)` → `{ score, maxScore, answeredCount, totalQuestions, completionPct, profile, sri, allocation }`.
  - `score` clamped `[0, maxScore]`; `answeredCount ≤ totalQuestions`; `completionPct ≤ 100`.
  - Profile thresholds tuned so all-min → Conservative/SRI 1, all-max → Aggressive/SRI 7.
- Suitability page binds live to `computeSuitability` on every answer change; Save disabled until `answeredCount === totalQuestions`.
- Settings card reads the same function from the same stored answers row.
- Unit tests in `src/lib/__tests__/suitability.test.ts`: all-min, all-max, partial, score-never-exceeds-max, monotonicity.

**1.4 Tax-loss harvesting bound to live holdings**
- `TaxHarvest` reads holdings from `usePortfolio`; computes per-position unrealised P&L using live quotes; lists losers; multiplies aggregate loss by jurisdiction rate (already in file).

**1.5 Net Worth vs Dashboard**
- Dashboard "accounts" tile reads the real `net_worth_accounts` count (or hides if 0). Remove hard-coded "13 accounts".

**1.6 Winner/loser bucketing**
- In `usePortfolio`: bucket `>0`, `<0`, `===0`, and `noPrice` (missing/0 live price); UI shows all four where relevant; counts must sum to holdings length. Holdings without live price display "no live price" instead of a fake 0%.

**Verification 1**: manual walkthrough + new unit tests; assert totals match across pages.

---

### Phase 2 — Error & empty states

- New `src/components/AiFallback.tsx` and `src/components/FeedFallback.tsx` (skeleton + friendly retry).
- Wrap market briefing call (`Home`/`Dashboard`) and Copilot stream in try/catch → render fallback, log raw error to console only.
- Macro / Movers / Watchlist / Deal Flow: skeleton while loading; explicit empty state with retry button when arrays are empty post-fetch.
- New `src/components/ErrorBoundary.tsx` wrapping each top-level route in `App.tsx`.

**Verification 2**: force-fail edge functions (block network) and confirm no raw strings surface.

---

### Phase 3 — Regulatory de-risking

- Sweep for actionable language. Files to rewrite: `Alerts.tsx`, `SmartPicks.tsx` (rename title), `Copilot.tsx` / `CopilotChat.tsx` suggested prompts, `Optimizer.tsx` & `Rebalance.tsx` headings, `Advisor.tsx`, `SentimentDashboard.tsx`.
- Rename in nav + page titles: Recommendations/Picks → "Research ideas"; Optimizer/Rebalance → "Allocation analysis (educational)".
- Copilot system prompt (`supabase/functions/copilot/index.ts`): hard refusal pattern for "should I buy/sell X / what should I buy" → reframe to educational + disclaimer. Add server-side regex pre-check + post-check.
- Live trade gate: `LiveOrderConfirmModal` + `live-trade` function → feature-flag off; UI copy changes to "read-only broker sync (SnapTrade)"; remove "place real orders" strings.
- Privacy policy (`pages/legal/Privacy.tsx`): placeholder entity name + address surfaced as `<EntityName>` / `<RegisteredAddress>` constants you fill in once — **I'll ask you for the legal entity name and address before shipping this**. Add AI-provider disclosure + AI opt-out toggle in `PrivacySettings.tsx` writing to `profiles.ai_opt_out`.
- Cookie banner: verify `ConsentBanner.tsx` — reject-all button equal weight, analytics default off.
- Sentiment page: replace source list with "Yahoo Finance + your connected providers".

**Verification 3**: grep for banned phrases (buy/sell/trim/rotate into/recommend); manual Copilot prompt tests.

---

### Phase 4 — UX/IA consolidation (only after 1–3 signed off)
Sidebar regrouping, onboarding flow, contrast audit, demo-data + Lovable badge removal, auth-gated root.

### Phase 5 — Missing capabilities (only after 4 signed off)
Real PDF exports, goal tracker + Monte-Carlo, PFM scope decision, advisor↔client household view.

---

### What I need from you before I start Phase 3
1. **Legal entity name + registered address** for the Privacy Policy.
2. Confirm live-trade / order placement should be **fully disabled** (not just hidden) until licensing — I'll feature-flag it off by default.

I'll start Phase 1 immediately and pause for your confirmation at the end of each phase. Sound good?
