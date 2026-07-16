# Advanced Strategies & Analytics — Round 4

Eight related additions across TA, backtest, and infra. All frontend + existing edge functions; no new tables.

## 1. Liquidity Sweep Detector
- `src/lib/ta/sweeps.ts`: `detectSweeps(bars, { lookback, wickRatio, minPenetrationATR, reclaimBars })` returning `{ index, bias, sweptLevel, wick, reclaimed }[]`. Reuses `findPivots` for swing highs/lows; wick ratio = wick / body; penetration measured in ATR units.
- `src/components/technical/LiquiditySweepCard.tsx`: config sliders (lookback 10–100, wick ratio 1.5–5, penetration 0.1–1.5 ATR, reclaim window 1–5), Recharts overlay with annotated recent swings + sweep markers, table of last 10 sweeps.
- Mounted on `/technical-analysis`.

## 2. AVWAP + Sweep Strategy Template
- Extend `strategyTypes.ts` with condition `avwap_sweep_reclaim` (params: anchorKind, valueAreaPct, sweepLookback).
- `validateStrategy.ts`: validate new params.
- `clientSim.ts` + `backtest-strategy/index.ts`: evaluate — entry when a sweep is detected AND current price is within AVWAP ± valueAreaPct*σ band from the selected anchor.
- Seed preset "AVWAP Sweep Reclaim" in `strategy_presets` (migration adds one row).

## 3. Spread & Volume-at-Price Visualizations
- `src/components/technical/SpreadFlowCard.tsx`: horizontal split showing approx bid/ask spread (from Yahoo `regularMarketBid/Ask` via existing `flow-snapshot`) + sweep activity bar from order flow deltas.
- Extend existing `VolumeAtPriceCard` with a directional-bias overlay (green/red segments per bin using signed delta from `computeOrderFlow`).
- Mounted on `/technical-analysis` next to `OrderFlowCard`.

## 4. Event-Driven Intraday Backtest Mode
- `src/lib/backtest/eventBacktest.ts`: given news timestamps + intraday bars, compute pre-window (N bars before) and post-window (M bars after) return/volatility, aggregated across events. Adds "volatility expansion" metric = post σ / pre σ.
- Extend `NewsEventBacktestCard` with pre/post window inputs and expansion chart.

## 5. Volatility Spread Module
- `src/lib/ta/volSpread.ts`: given two series (e.g., ^VIX vs SPY realized vol, or GVZ vs GLD realized vol), compute z-score of the ratio, trend filter (EMA slope), and generate long/short spread signals.
- `src/components/technical/VolSpreadCard.tsx`: symbol pair selector (presets: VIX/SPY, GVZ/GLD, VXN/QQQ), z-entry/exit sliders, EMA trend filter toggle, PnL preview using existing `simulateCustom` on the spread series.
- Mounted on `/technical-analysis`.

## 6. Simulation Cache Panel
- `src/components/backtest/SimCachePanel.tsx`: shows `cacheStats()` (entries, current bars fingerprint, max cap), buttons to clear cache and drop LS, slider for `MAX_ENTRIES` (50–1000) and `maxAgeDays` (1–90).
- `simCache.ts`: add `setMaxEntries`, `setMaxAgeDays`, timestamp each entry, evict on hydrate when older than max age. Persist settings under `simcache:settings:v1`.
- Mounted on `/backtest`.

## 7. Progress Bar + ETA
- `simCache.ts` `runCachedParallel`: extend `ProgressFn` signature to include `etaMs` computed from rolling completion rate. Non-breaking: existing callers ignore extra arg.
- `SensitivityHeatmap.tsx` and `WalkForwardOptimizerCard.tsx`: render a `<Progress>` bar with `done/total`, hits ratio, and formatted ETA (mm:ss).

## 8. CPU Cap Setting
- `simCache.ts`: `setMaxWorkers(n | "auto")`, persisted under `simcache:settings:v1`. `detectConcurrency()` honors the cap. When `n===0` or workers disabled by user, force sequential fallback.
- Expose control in `SimCachePanel` (slider 1–hardwareConcurrency, plus "Auto" and "Disable workers" toggles).

## Files
Created (~7): `src/lib/ta/sweeps.ts`, `src/lib/ta/volSpread.ts`, `src/lib/backtest/eventBacktest.ts`, `src/components/technical/LiquiditySweepCard.tsx`, `src/components/technical/SpreadFlowCard.tsx`, `src/components/technical/VolSpreadCard.tsx`, `src/components/backtest/SimCachePanel.tsx`.

Edited: `src/lib/ta/strategyTypes.ts`, `src/lib/ta/validateStrategy.ts`, `src/lib/backtest/clientSim.ts`, `src/lib/backtest/simCache.ts`, `src/components/backtest/SensitivityHeatmap.tsx`, `src/components/backtest/WalkForwardOptimizerCard.tsx`, `src/components/technical/VolumeAtPriceCard.tsx`, `src/components/backtest/NewsEventBacktestCard.tsx`, `src/pages/TechnicalAnalysis.tsx`, `src/pages/BacktestingModule.tsx`, `supabase/functions/backtest-strategy/index.ts`.

Migration: one new row in `strategy_presets` for the AVWAP-Sweep preset.

## Out of scope
- True L2 tape (still approximated from OHLC + Yahoo quote snapshot).
- Realtime streaming greeks/vol surfaces.
- Multi-leg options spreads on the vol module (single-series spread only).

Approve to build.
