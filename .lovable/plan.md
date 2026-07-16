
# Advanced Trading Strategies & Analytics Suite

This builds on the existing Technical Analysis + Strategy Builder + Backtest stack (already ships SMC signals, top-down, patterns, walk-forward, sensitivity, regime, cost model). It closes the ticket by adding the missing strategy families and analytics as first-class, backtestable modules.

## Scope

New library modules (`src/lib/ta/*`, `src/lib/backtest/*`) + focused cards mounted on `/technical-analysis` and `/backtest`, plus one new `/strategy-lab` page that houses the full plan framework.

### 1. SMC deep pack (`src/lib/ta/smc.ts`)
Extend current SMC helper with:
- Order blocks (bullish/bearish last-opposite-candle before impulse)
- Fair Value Gaps (3-candle imbalance) with mitigation status
- Liquidity sweeps (equal highs/lows + wick sweep + close-back)
- Market structure shifts (BOS / CHoCH from swing pivots)
- Supply/demand zones (base–rally / base–drop clusters)
Rendered in a new `SMCDeepCard` on `/technical-analysis`.

### 2. Order & options flow (`src/lib/flow/*`, edge fn `flow-snapshot`)
- Client: `OrderFlowCard` (bid/ask imbalance proxy from bar-by-bar delta), `VolumeAtPriceCard` (histogram from bars), `OptionsFlowCard` (unusual volume/OI + sweep-vs-block classification)
- Edge fn `flow-snapshot` pulls options chain via existing data provider (Yahoo/Finnhub already wired) and returns aggregated metrics; caches to `market_data_cache`.

### 3. Anchored VWAP + Volume Profile (`src/lib/ta/avwap.ts`, `volumeProfile.ts`)
- Multi-anchor AVWAP with click-to-anchor timeline (session, swing high/low, event date)
- Volume Profile with POC, VAH/VAL (70% VA), fixed range + visible range modes
- Combined `AVWAPProfileCard` that highlights confluence bands (AVWAP within VA) and sweep-into-AVWAP events

### 4. Algorithmic trend trading
Extend `strategyTypes.ts` with condition kinds:
`ema_cross`, `adx_above`, `donchian_break`, `supertrend_flip`, `ma_stack_aligned`
Each already backtestable through the existing `backtest-strategy` edge fn (add the evaluators) and client sim.

### 5. News-driven intraday (`src/lib/news/*`, edge fn `news-events`)
- Reuse existing sentiment pipeline; add event window backtest mode: enter N bars after headline if sentiment > threshold, exit at fixed horizon / stop
- New `NewsEventBacktestCard` on `/backtest`

### 6. Volatility trading (`src/lib/ta/volatility.ts`)
- ATR-percentile, realized-vol z-score, VIX/GVZ-style ratio for the current symbol vs its benchmark
- `VolatilityCard` with regime tag and a volatility-breakout preset strategy

### 7. Pattern & Fibonacci enhancements (`src/lib/ta/patterns.ts`, `fib.ts`)
- Add reversal (H&S, double top/bottom, wedges), continuation (flags, pennants, triangles), bilateral (symmetrical triangle, diamond)
- Auto Fib retracement (0.236–0.786) and extension (1.272/1.618) from last impulse; signal when price reacts at cluster
- Surface via existing pattern strategy card (already integrated with builder)

### 8. Strategy Lab page (`/strategy-lab`)
One place to formally define, test, and ship a plan:
```
+------------------ Strategy Lab ------------------+
| [ Plan header: name, symbol, timeframe, tags ]   |
| Entry rules | Exit rules | Risk (R:R, sizing)    |
| Presets: SMC-sweep+AVWAP | Trend-EMA-stack |     |
|          News-event | Vol-breakout | Fib-cluster |
| [ Validate ] [ Backtest ] [ Walk-forward ] [PDF] |
| Results tabs: Equity | Trades | Regime | Sens.   |
+---------------------------------------------------+
```
Reuses `StrategyBuilderCard`, `BacktestDetailCharts`, `WalkForwardCard`, `SensitivityHeatmap`, `RegimeBreakdownCard`, `TechnicalExportCard`. Presets seed the rule graph with validated defaults.

## Data / backend
- Migration: add `strategy_presets` table (id, slug, name, description, entry_rules jsonb, exit_rules jsonb, risk_config jsonb, tags text[]) with `authenticated` read + service_role admin; seed 8 presets in same migration.
- Edge fn `flow-snapshot` and `news-events` (verify_jwt default). Reuse `TWELVE_DATA_API_KEY` / `FINNHUB_API_KEY` / `FRED_API_KEY` already saved.
- Extend `backtest-strategy` evaluator switch to cover the new condition kinds; keep parity in `clientSim.ts`.

## Files
Create:
- `src/lib/ta/{smc.ts,avwap.ts,volumeProfile.ts,volatility.ts,patterns.ts,fib.ts}`
- `src/lib/flow/{orderFlow.ts,optionsFlow.ts,volumeAtPrice.ts}`
- `src/lib/news/eventBacktest.ts`
- `src/components/technical/{SMCDeepCard,AVWAPProfileCard,VolatilityCard,OrderFlowCard,OptionsFlowCard,VolumeAtPriceCard}.tsx`
- `src/components/backtest/NewsEventBacktestCard.tsx`
- `src/pages/StrategyLab.tsx` + route entry
- `supabase/functions/flow-snapshot/index.ts`, `supabase/functions/news-events/index.ts`
- `supabase/migrations/<ts>_strategy_presets.sql`

Edit:
- `src/lib/ta/strategyTypes.ts`, `src/lib/backtest/clientSim.ts`, `supabase/functions/backtest-strategy/index.ts` — add new condition kinds
- `src/pages/TechnicalAnalysis.tsx` — mount SMC deep, AVWAP+Profile, Volatility, Flow cards behind the same entitlement gate
- `src/pages/BacktestingModule.tsx` — mount News-event card
- `src/App.tsx` — register `/strategy-lab` route (feature-gated)

## Entitlements
All new cards gated behind existing `ai.copilot` / pro tier feature keys already used by Strategy Builder. Presets table readable by any authenticated user.

## Out of scope (call out)
- True L2/L3 order book (requires paid market-data feed the project doesn't have) — we approximate with bar delta + volume-at-price and clearly label it as a proxy in the UI.
- Live options greeks streaming — snapshot only, cached.
