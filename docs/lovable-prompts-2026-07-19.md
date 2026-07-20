# Lovable prompt pack — 19 Jul 2026

Copy-paste these into Lovable **one at a time, in order**. Prompt 1 is required to
finish activating the plan gating that just landed on `main` (commit `834f34d`).
Each prompt is self-contained.

---

## Prompt 1 — REQUIRED: apply the gating migration

> Run this SQL migration against the database. It was added to the repo as
> `supabase/migrations/20260717090000_gate_premium_modules.sql` via GitHub, so it
> may not have been applied yet. It registers feature_catalog keys for premium
> modules that had none, and grants them to plans: Pro gets portfolio.optimizer,
> portfolio.rebalance, research.event_study and tax.harvest; Elite/Advisor/
> Enterprise additionally get quant.alpha and dealflow.access. Use the exact SQL
> from that file — do not rewrite it. Do not modify any other plan feature_keys.
> After applying, confirm by selecting slug and feature_keys from
> subscription_plans.
>
> Context: App.tsx now wraps premium routes in `<RouteFeatureGate feature="...">`
> (src/components/gating/RouteFeatureGate.tsx). That component fails open when a
> key is missing from feature_catalog, so the routes gated with the six new keys
> (optimizer, rebalance, event-study, tax-harvest, quant, dealflow) stay unlocked
> until this migration runs. The routes gated with existing keys (backtest,
> strategy-lab, risk, simulations, sentiment, advisor, api) are already enforcing.

## Prompt 2 — QA the gating end to end

> Verify plan gating works. Using a test account on the Plus plan (or by
> temporarily removing keys from the plus plan's feature_keys), open /backtest,
> /strategy-lab, /risk, /simulations, /quant, /tax-harvest, /dealflow, /optimizer,
> /rebalance, /event-study, /advisor and /api. Each should show the FeatureGate
> upgrade card naming the correct target plan, not the page content. Then verify a
> Pro account can open everything except /quant, /dealflow and /api. Confirm each
> block writes a row to feature_gate_blocks. Do not change the gating logic in
> RouteFeatureGate.tsx or FeatureGate.tsx — fix only feature_keys data or missing
> RouteFeatureGate wrappers if a page is wrongly open.

## Prompt 3 — Sidebar: split the 25-item Portfolio group

> In src/components/AppSidebar.tsx the PORTFOLIO nav group has ~25 items and the
> MARKETS group has ~17, which makes the menu hard to scan. Restructure into
> smaller groups while keeping the existing NavGroup collapsible mechanics and
> localStorage persistence (vela.sidebar.group.*):
>
> 1. "Portfolio" (default open): Portfolio, Orders, Goals, Budget, Dividend
>    Planner, Household, Tax, Net Worth (keep its existing sub-collapsible).
> 2. New group "Analyst tools" (default closed): Backtesting, Strategy Lab,
>    Optimizer, Rebalance, Simulations, Risk Engine, Event Study, Technical,
>    Quant Alpha, Blotter, Peers, Paper Trading, Short Selling, Buyback Analyzer,
>    ETF Overlap, 13F Replicator.
> 3. "Markets" (default open): Explore, Movers, Watchlist, Screener, Macro,
>    Sectors, Compare.
> 4. New group "Market data" (default closed): Options, Futures, Intraday,
>    Baskets, Corp. Actions, Filings, Earnings, Insider, Credit Spreads,
>    Bond Calculator.
> 5. Keep Research, Assistant, Learn, Account, Founder as they are. Move Notes
>    and Documents into Account or Research (your call, one of the two).
> 6. Reduce "new" badges to at most 3 across the whole sidebar (newest features
>    only) — badge inflation makes them meaningless.
>
> Do not remove any route or change any URL. Keep icon-collapsed mode working.

## Prompt 4 — Sidebar: lock chips on gated items

> In src/components/AppSidebar.tsx, show a small lock indicator on nav items whose
> feature the current user's plan does not include. Use the existing
> useFeatureGate() hook (src/hooks/useFeatureGate.ts): for a nav item with an
> associated feature key, if gate.catalog contains the key and !gate.has(key),
> render a subtle lock icon + the name of the cheapest plan that includes it
> (gate.plans.find(p => p.feature_keys.includes(key))?.name) instead of a badge.
> Items stay clickable — the route already shows the upgrade screen. Feature keys
> per item: Backtesting→ai.backtests, Strategy Lab→strategy.proposal_builder,
> Risk Engine→portfolio.stress_test, Simulations→portfolio.simulations,
> Sentiment→ai.sentiment, Portfolio Coach→portfolio.doctor, Optimizer→
> portfolio.optimizer, Rebalance→portfolio.rebalance, Event Study→
> research.event_study, Tax→tax.harvest, Quant Alpha→quant.alpha, Deal Flow→
> dealflow.access, API-related items→enterprise.api. Call useFeatureGate once at
> the sidebar root and pass down — not once per item.

## Prompt 5 — Fix: public blog is empty for logged-out visitors

> The public Blog page shows no posts for anonymous visitors: an anon select on
> blog_posts_public returns 0 rows. The repo's own regression test
> (src/__tests__/blog-public-anon.regression.test.ts) fails for this reason.
> Diagnose whether the cause is the RLS policy or grants on blog_posts_public
> (likely the anon role lacks select, or the underlying policy calls a function
> anon cannot execute — we previously hit "permission denied for function
> has_role" for anon on other tables). Fix with a migration that grants anon
> read access to published posts only, without exposing drafts, and confirm the
> regression test passes.

## Prompt 6 — Fix: Upgrade.tsx hardcoded tier checks (failing repo test)

> The test "does not hardcode tier equality checks outside the billing allowlist"
> in src/__tests__/entitlementsSource.test.ts fails because of
> src/pages/Upgrade.tsx line ~89 (p.slug === "enterprise") and line ~165
> (plan.slug === "pro" for button variant). Refactor to satisfy the test using
> the sanctioned helpers from src/lib/planFeatures.ts: use
> PLAN_FEATURES[slug].contactSales for the enterprise branch and
> PLAN_FEATURES[slug].highlighted for the button variant, instead of comparing
> slug literals. Behavior must be pixel-identical. Run the test to confirm.

## Prompt 7 — Fix: landing nav accessibility (failing repo tests)

> Two a11y tests fail in src/components/landing/__tests__/LandingNavA11y.test.ts:
> (1) not every header nav anchor has a focus-visible ring — add a visible
> focus-visible style (e.g. focus-visible:ring-2 focus-visible:ring-offset-2 or
> the CSS equivalent in the landing's inline styles) to every anchor in the
> landing header, and (2) the auth CTAs don't enforce a 44px minimum tap-target
> height on mobile — add min-h-[44px] (or min-height:44px) to the Sign In and
> Get Started links. Make the tests pass without weakening them.

## Prompt 8 — Perf: virtualize Copilot chat history

> The /copilot page renders the user's entire chat history in the DOM (observed
> ~137k characters of text for one account) which will degrade as history grows.
> Paginate or virtualize it: load only the most recent ~30 messages initially
> with a "Load earlier messages" affordance at the top (or windowed rendering).
> Keep scroll position stable when older messages load, keep the composer and
> streaming behavior unchanged, and don't alter how messages are stored.
