# Roadmap

## Done
- [x] Monte Carlo / scenario simulation driven by advanced backtest signals.
- [x] `/advanced-analysis` with TA indicators, signal overlays, personal detector parameters.
- [x] Predictive regulatory-impact analysis (AI, source-aware, honest error states).
- [x] Cited risk checklist with severity (low/medium/high) and review tracking.
- [x] Tagging + fast search/filters (company, period, analysis type, tag) on saved notes.
- [x] Watchlist monitor with new filing/earnings alerts and direct AI-analysis links.
- [x] Automatic latest-vs-previous report diff (guidance, risks, narrative, metrics).
- [x] Multiline Copilot chat input (Shift+Enter newline, Enter sends, autosize).
- [x] Full backtest report card on Advanced Analysis (real OHLCV, presets, metrics, equity curve, trade signals).
- [x] Regional Markets page (MENA, APAC, China, LatAm, Africa) with macro snapshots, drivers, risks, instruments.
- [x] Proposed vs Current portfolio comparison (overlap, diversification HHI, rebalance suggestions).
- [x] Short selling + derivatives tooling (existing `/short-selling`, `/options`, `/futures`, paper trading) confirmed routed.
- [x] Live official-source web research (`web-research` + `research_web` Copilot tool).
- [x] Instrument master (ISIN/domicile/UCITS/KID/TER/tax situs) + `lookup_instruments`.
- [x] Advanced simulation engine (bootstrap, fat tails, regimes, FX, costs, margin/liquidation) + blend search.
- [x] Orchestrated `/full-analysis` run and `run_full_analysis` Copilot tool.

## Open
- [x] Add personal friend invite links, deduplicated tracked visits and signup conversion counts; verified authenticated link creation, repeat-visit deduplication and mobile layout.
- [ ] Verify a complete referral signup and email confirmation: test domains were rejected by hosted email checks; transactional auth-trigger regression requires privileged database access unavailable to the test runner.
- [x] Add a free public Italian PAC calculator and practical guide, link from homepage/blog, and verify calculations, CSV download and mobile use.
- [x] Recheck and unify current pricing, FAQs and upgrade displays; protect shared native pricing and subscription management from website checkout. Apple activation remains blocked as listed below.
- [x] Implement Apple Pro purchase/restore/manage screens, verified provider-separated entitlements, all-paid strategy/backtesting access, and subscription setup checklist.
- [ ] Activate and test Apple purchases: waiting for App Store Connect Pro products, real RevenueCat iOS app/public SDK key, webhook configuration, and Mac/iPhone sandbox validation; native sync requires a local web build.
- [x] Audit and correct Apple submission screenshots, legal documents and pricing against the published app; external release checks are listed in the v2 package.
- [x] Align homepage, FAQ and feature comparison with verified plan limits without changing access.
- [ ] Order flow & options microstructure page (Yahoo-derived + free open-source data only).
- [ ] Italian regulatory source and "normative in arrivo" section on Regulatory Analysis.
- [ ] Authenticated client-only portal (no admin login) with research reports, notes, portfolio.
- [x] Fix regulatory-analysis validation_failed (missing focus) — derive focus in copilot + tolerate in function
- [x] Investigate "Tool loop limit reached" message in Copilot
