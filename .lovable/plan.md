## Vela Advisor v2 — Multi-Strategy Cross-Asset Engine

A rebuild of `/advisor` that runs every portfolio strategy in parallel against your live book, picks a winner *and* a blended consensus, drafts a concrete order plan across every asset class (long, short, options), and lets you fire the whole thing into paper trading in one click. Everything that goes beyond plain long-only equity is gated by your MiFID II suitability profile and a per-account toggle you control.

### What the user sees

A redesigned `/advisor` page with three stacked sections:

1. **Strategy lab** — runs MVO, Risk-Parity, HRP, Momentum tilt, Factor tilt, Max-Sharpe and Min-Drawdown in parallel against your current holdings + investable universe. Each strategy returns weights, expected return, vol, Sharpe, max drawdown, turnover vs your current book, and a suitability fit score. They are ranked side-by-side in a sortable table.
2. **Recommendation** — two cards rendered at the top:
   - **Winner** — the single highest-scoring strategy for your suitability profile, with its rationale.
   - **Blended consensus** — confidence-weighted average of the top three strategies, designed to be more robust and less style-specific. This is what the order plan defaults to, with a toggle to switch to the winner instead.
3. **Order plan + one-click paper run** — concrete, sized orders in your base currency translating target weights into actions: `Sell 12 of 47 NVDA`, `Buy 8 GLD`, `Open 2,000 EUR BTPS.MI`, `Short 25 XOM`, `Sell to open 2x AAPL 195 covered calls Dec 26`. Each row is editable. A primary button submits the whole plan to your paper account via the existing `place_paper_order` pipeline.

A **Download full report** button on the page emits a PDF showing every strategy's output, the winner, the blended consensus, the order plan, and the gating decisions — so you have an audit trail.

### Action vocabulary

The advisor moves from `{ hold, add, trim, sell_all }` to a full set:

```text
buy_new            open a new position in any asset class
add_to             add to an existing position
trim_n_shares      reduce position by a specific share count
sell_all           close a position
swap_into          sell A and buy B in one move (single rationale)
allocate_cash_to   deploy idle cash into bond/commodity/crypto/FX bucket
hedge_with         offsetting long position (e.g. add GLD against equity beta)
short              open short equity/ETF
open_option        covered call, protective put, collar, vertical spread,
                   cash-secured put, iron condor
close_option       unwind an existing option leg
```

### Gating and regulation

Three layers, all enforced server-side:

1. **MiFID II suitability profile** — knowledge, experience, capacity for loss. The advisor reads it from `investor_profiles` and silently drops any action class the user isn't classified for.
2. **Per-user toggles** in Settings → Advisor: `allow_cross_asset`, `allow_shorts`, `allow_derivatives`. New columns on `profiles`. Default off.
3. **Owner kill-switch** — feature flag `advisor_unrestricted_enabled`. When off, the page locks everything beyond long-only equity for everyone regardless of profile/toggle. Visible in the existing Owner Console controls tab.

If a strategy would suggest a gated action, the engine substitutes the closest allowed alternative (e.g. a protective put is replaced with cash buffer) and logs the substitution so the report shows what was filtered out and why.

### Strategy engine

Each strategy receives: current holdings, available cash, investable universe (your watchlist + curated cross-asset baskets), suitability constraints, and a scoring rubric. It returns weights and stats. Strategies run in parallel inside one Edge Function call.

Universe is built per asset class so non-equity moves are possible:
- Equity: current holdings ∪ watchlist ∪ curated regional baskets.
- Bonds: TLT, IEF, AGG, BND, IEAG.L, BTPS.MI, IBGL.L plus user-specified.
- Commodities: GLD, IAU, SLV, USO, BNO, UNG plus the futures wrappers.
- Crypto: BTC-USD, ETH-USD plus IBIT / ETHA spot ETF wrappers.
- FX: only as a hedge when base currency mismatch is material.

Scoring rubric per strategy:
```text
score = w1·sharpe − w2·max_drawdown − w3·turnover − w4·suitability_breach
        + w5·diversification_gain
```
Weights are read from owner-tunable defaults; the user can override them in an advanced panel.

### Order plan generator

Translates target weights into orders with:
- Lot-sized share counts (no fractional unless the user opted in).
- Base-currency sizing via the live FX rate from `get_quote`.
- Side, type (market/limit), suggested limit price as the most recent close, time-in-force.
- For options: underlying, expiry, strike, side, structure label.
- Each row is editable inline; the paper-execution call uses the edited values.

The execution button calls the existing `place_paper_order` edge function per row, in sequence, surfacing per-order success/failure toasts and writing a single `paper_run` log entry.

### Downloadable report

Generated server-side as a PDF written to `/mnt/documents/advisor_run_<id>.pdf` for ad-hoc downloads, and as a `pdf_export_log` entry for in-app history. Contents:
- Cover page: profile snapshot, gating decisions, timestamp.
- Per-strategy section: weights, stats, drift vs current, rationale.
- Winner card.
- Blended consensus card.
- Order plan with rationale per order.
- Substituted/dropped actions table (what gating removed and why).
- Disclaimer footer driven by the user's profile (full disclaimer for restricted profiles, lighter framing for unrestricted).

### Technical details

New tables (with grants + RLS scoped to `auth.uid()`):
- `advisor_runs` — id, user_id, run_at, winner_strategy, blended_weights, gating_decisions jsonb, report_path.
- `advisor_orders` — id, run_id, sequence, action, symbol, qty, side, type, limit_price, status, paper_order_id.

New `profiles` columns: `allow_cross_asset bool default false`, `allow_shorts bool default false`, `allow_derivatives bool default false`.

New feature flag row: `advisor_unrestricted_enabled` (owner toggle).

New edge functions:
- `advisor-run` — orchestrates strategy fan-out, gating, scoring, blending, order-plan generation; persists `advisor_runs` + `advisor_orders`.
- `advisor-execute-paper` — iterates `advisor_orders` for a run and calls `place_paper_order` per row.
- `advisor-report` — renders the PDF (reuse existing PDF stack), writes the file, returns a signed URL.

Reuse: `src/lib/optimizer.ts` (mean-variance, risk-parity, HRP), `market-data` edge function for OHLC, `place_paper_order` tool, the existing `paper_trades` table, the existing PDF export pipeline.

Frontend:
- Rebuild `src/pages/Advisor.tsx`.
- New components: `StrategyLabTable`, `RecommendationCards`, `OrderPlanEditor`, `AdvisorGatingBanner`.
- Settings → Advisor toggles section.
- Owner Console: surface `advisor_unrestricted_enabled` next to the existing kill-switches and rename the KPI accordingly.

Out of scope for this pass: live-money order routing (still blocked at platform level), tax-lot optimisation, multi-account aggregation, scheduled/recurring advisor runs. These are clean follow-ups.

### Rollout

1. Migrations + grants + RLS.
2. Edge functions (`advisor-run`, `advisor-execute-paper`, `advisor-report`).
3. Advisor page rebuild + Settings toggles.
4. Owner Console kill-switch.
5. PDF report.
6. Wire copilot so "run the advisor" is a callable tool, mirroring the existing `place_paper_order` confirmation flow.
