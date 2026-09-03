# Advanced portfolio, technical, and regulatory analysis

## Outcome
Deliver three connected analysis workflows without duplicating the existing quantitative engines:

1. **Signal-aware portfolio simulation** — extend the existing Monte Carlo/scenario page so advanced backtest signals can be passed in, displayed as a scenario overlay, and saved with the simulation parameters.
2. **Advanced Analysis page** — add a dedicated `/advanced-analysis` workspace with instrument selection, OHLCV loading, personal detector parameters, core TA indicators, and the existing advanced signal overlay chart.
3. **Predictive regulatory analysis** — add a `/regulatory-analysis` workspace that accepts a sector/company/instrument focus and a proposed rule or regulatory trend, then produces a structured, source-aware impact assessment through Lovable Cloud AI with visible failure states.

## User-facing changes
- Add a signal-aware mode to portfolio simulations: choose a saved/current signal profile, apply configurable bullish/bearish signal return and volatility adjustments, and compare baseline versus signal-adjusted outcomes.
- Add an Advanced Analysis navigation entry and page with ticker search, date range, indicator toggles/values, overlay chart, and personal detector settings.
- Add regulatory inputs for jurisdiction, topic, affected instruments/sectors, time horizon, and scenario stance; show impact by revenue/cost/capital/risk, affected assets, confidence, assumptions, and sources/disclaimer.
- Keep controls responsive and use existing semantic design tokens/components.

## Technical implementation
- Extend the pure simulation types/engine with optional signal adjustments and deterministic scenario evaluation so tests remain fast and reproducible.
- Reuse `market-data`, `AdvancedBacktestChart`, `DetectorSettingsCard`, `analyzeAll`, and the existing ticker components instead of creating parallel detectors.
- Add a small regulatory edge function using the existing AI provider/access/error conventions. It will validate inputs, use a strict JSON schema, include public research sources, and surface HTTP/error messages rather than fabricating a successful analysis.
- Add client-side request handling that distinguishes terminal gateway errors from bounded retryable `429`/`5xx` responses; no automatic retries for `400`/`401`/`402`/`403`.
- Add focused regression tests for signal adjustments, scenario output, and regulatory response validation; run typecheck/tests and browser-check the new routes.

## Verification
- Existing backtest and portfolio simulation behavior remains available when signal mode is off.
- Monte Carlo output renders baseline and adjusted distributions with summary deltas.
- Advanced Analysis loads real OHLCV data, renders indicators/overlays, and persists personal settings locally.
- Regulatory analysis renders structured results, sources, disclaimer, loading, and explicit error states.
