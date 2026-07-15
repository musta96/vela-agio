# AI-Powered Advanced Technical Analysis

Scope is very large. Proposal: ship it as **four modules on `/technical`** plus a new **Strategy Builder** wired into `/backtest`, all client-side computed from existing OHLC data (no new market-data provider needed). AI narrative summary via existing Lovable AI edge function.

## Modules

### 1. Pattern & structure engine (pure TS lib)
New `src/lib/ta/` package computing everything from OHLC bars already returned by `useOHLCHistory`:
- **Candlestick patterns** — all 19 requested: hammer, inverted hammer, hanging man, shooting star, engulfing (bull/bear), morning/evening star, piercing line, dark cloud cover, three white soldiers, three black crows, dragonfly/gravestone/standard doji, spinning top, marubozu.
- **Chart patterns** — head & shoulders (+ inverse), double top/bottom, ascending/descending/symmetrical triangles, bull/bear flags, wedges, using pivot-high/low detection.
- **Support & resistance** — dynamic (rolling pivot clusters w/ touch count) + static (round-number & prior swing highs/lows).
- **Trendlines** — auto-fit through swing pivots with breakout flag.
- **Smart-money concepts** — Fair Value Gaps (3-bar imbalances), Order Blocks (last opposing candle before displacement), Liquidity Grabs (sweep-and-reclaim of prior swing), Break of Structure / Change of Character.
- **Supply/demand zones** — base-then-drop / base-then-rally clustering.

Unit-tested with vitest.

### 2. Chart overlay
Upgrade the existing candle chart on `/technical` with a lightweight canvas overlay layer showing:
- Colored zones for S/R, supply/demand, FVGs, order blocks.
- Trendlines and their breakout markers.
- Candle-pattern flags rendered above/below the affected bars (click → detail popover: definition, bias, invalidation level).
- Toggle chips to show/hide each family.

### 3. Actionable indicator insights
Beside the existing RSI / MACD / MA charts, add an **Insights** card that turns raw values into signals:
- "RSI overbought (73) — potential mean-reversion short"
- "Golden Cross detected 4 bars ago (SMA50 > SMA200)"
- "MACD bull-cross with rising histogram"
- "Volume surge 2.4× 20-day avg confirming breakout"
- Each row: signal name, timeframe, direction, confidence, "how to trade it".

### 4. Trade planner (R:R + position sizing)
New card: user picks entry, stop, target (auto-prefilled from nearest S/R). Outputs:
- Risk:Reward ratio, expected value.
- Position size in shares/contracts based on **% account risk** setting (default 1%) pulled from the existing portfolio risk settings if available.
- Distance-to-stop as ATR multiple; warn if < 1 ATR.

### 5. Multi-timeframe / top-down analysis
A **Top-Down** tab showing the same asset synchronized across 1W / 1D / 4H / 1H:
- Compact scorecards per timeframe with trend, key S/R, active patterns.
- "Alignment score" – how many timeframes agree bullish vs bearish.

### 6. Strategy Builder → backtest bridge
- New `/technical` section: build a rule from the detected primitives (e.g. "Enter long when: RSI < 30 AND bullish engulfing AND price at support. Exit: 2R target or ATR-stop.").
- Save to a new `trading_strategies` table (user-scoped, RLS).
- "Backtest this strategy" button links into `/backtest` with strategy pre-loaded (extend BacktestingModule to run rule-based strategies against historical bars).

### 7. AI narrative
New edge function `technical-analysis-brief` (Lovable AI, `openai/gpt-5.5`) takes the computed pattern/indicator/structure JSON and returns a portfolio-manager style trade thesis, using the existing AI access gating & throttling pattern (mirrors `equity-research-analyst`). Cached per (symbol, timeframe, latest-bar-timestamp).

## Delivery in phases

Given the breadth I'd ship in three PRs to keep each reviewable:

**Phase 1 — Core engine + overlay + insights** (this turn if you approve)
- `src/lib/ta/` package with all pattern & structure detectors + tests
- Chart overlay + toggle chips
- Actionable indicator insights card
- Trade planner card with R:R and position sizing
- AI narrative edge function + "AI trade thesis" panel

**Phase 2 — Top-Down multi-timeframe view** (next turn)
- Parallel fetching of 4 timeframes + alignment scoring UI

**Phase 3 — Strategy Builder + backtest integration** (next turn)
- `trading_strategies` table + migration
- Rule builder UI
- Extension of `/backtest` to execute rule-based strategies

## Technical notes
- All detectors are pure functions over `OHLCBar[]`; no new market-data source.
- Overlay uses SVG on top of the existing recharts container to keep bundle size flat; no `lightweight-charts` dependency added.
- Position sizing reads from `profiles.risk_pct` if present, otherwise defaults to 1% with a user-editable input.
- No breaking changes to existing `/technical` sections — everything is additive.

## Question before I start

**Do you want me to ship Phase 1 now** (engine + overlay + insights + trade planner + AI thesis), and I'll do Phases 2 & 3 in follow-up turns? Or should I re-scope (e.g., skip the smart-money concepts, or start with Strategy Builder first)?