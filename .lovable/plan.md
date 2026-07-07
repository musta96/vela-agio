# Entry Timing Signal Engine

Add a single source of truth for "when to buy" signals per ticker, then surface it consistently in the portfolio memo, the Technical Analysis page, and the Copilot tool catalog.

## 1. Signal engine (new edge function `timing-signals`)

Input: `{ symbol: string, lookbackDays?: number }`. Output: a structured verdict per ticker.

Computed from existing `market-data` daily bars + the `deep-analysis` fundamentals payload we already fetch:

- **Technicals** (self-contained math, no new deps):
  - RSI(14) — flag `oversold ≤30`, `overbought ≥70`.
  - MACD(12,26,9) — flag last-bar crossovers.
  - Price vs 50-DMA and 200-DMA — trend + golden/death-cross detection on last N bars.
  - 20-day realized volatility percentile vs 1y.
- **Fundamentals** (from `deep-analysis`):
  - Post-earnings dip: last earnings date within 10 sessions AND close < pre-print close.
  - P/E vs 5y median (uses trailingPE and forwardPE if available; else omitted with a data_gap note).
- **Macro proximity** (from existing `macro-series` + `earnings-calendar`):
  - Days until next FOMC / ECB decision (if within 21 days flag "policy window").
  - Days until next US CPI (if within 10 sessions flag "print window").
  - Ticker-specific earnings within 14 sessions.

Output shape:
```ts
{ symbol, asOf, verdict: "buy"|"wait"|"avoid",
  score: -100..+100,
  signals: [{ family: "tech"|"fund"|"macro", key, value, direction, weight, note }],
  headline: string,   // one sentence
  sources: [{ label, url, retrieved_at }] }
```

Scoring: additive weights per signal; verdict thresholds `>+25`, `-25..+25`, `<-25`.

## 2. Portfolio memo: "Entry Timing" section

- Adapter fans out `timing-signals` alongside `deep-analysis` for every allocation ticker (parallel, `withRetry`, same progress panel).
- New PDF section `Entry timing` rendered before `Instrument deep-dive`, one row per ticker: ticker · verdict badge · score · headline · top 3 contributing signals.
- New `MemoInputSchema.timing_signals?: TimingRow[]` with a small Zod addition mirrored client + server.
- Toggle in `PortfolioMemoBuilder` (default on) mirrors the correlation-sensitivity toggle.

## 3. `/technical` page

- Add a "Entry timing" card at the top of the ticker view calling `timing-signals`.
- Renders verdict + score gauge, signal chips grouped by family (tech / fund / macro), and the sources.
- Reuses the same tokens as existing cards; no new design.

## 4. Copilot tool

- Register `get_timing_signals` in the copilot tool catalog (edge function `copilot`), inputSchema `{ symbol }`, calls the same `timing-signals` function server-side, returns the JSON verdict for the model to summarise.

## Technical details

**New files**
- `supabase/functions/timing-signals/index.ts` (Deno serve, corsHeaders, Zod input, all math self-contained).
- `src/lib/timing/schema.ts` (shared TS type + Zod).
- `src/lib/timing/client.ts` (`fetchTimingSignals(symbol)`).
- `src/components/timing/TimingCard.tsx` (used on `/technical`).
- `src/lib/timing/__tests__/scoring.test.ts` (RSI, MACD cross, weight aggregation).

**Edited files**
- `supabase/functions/generate-memo-pdf/index.ts` — new `timingSection` renderer, TOC entry, Zod field.
- `src/lib/memo/schema.ts` — mirror the Zod field.
- `src/lib/memo/adapter.ts` — accept `timing_signals?` in `MemoExtras`, pass through.
- `src/components/PortfolioMemoBuilder.tsx` — parallel fan-out for timing + progress rows + toggle.
- `src/pages/TechnicalAnalysis.tsx` — mount `<TimingCard symbol=... />`.
- `supabase/functions/copilot/index.ts` — register the tool + case handler that invokes `timing-signals`.

**Out of scope this pass**
- Intraday signals (only daily bars).
- Options-implied timing (IV skew, put/call). Can layer in later.
- Backtesting of the verdict itself — the memo cites it as an entry-window signal, not a track record.

## Verification
- Vitest for `scoreSignals()` — deterministic fixtures for RSI 25 (buy), RSI 75 (avoid), post-earnings dip (buy), CPI-in-2-days (wait).
- Deno test for the `timing-signals` function against a fixture bar series.
- Manual: generate a memo with 3 tickers and confirm the new "Entry timing" section renders with distinct verdicts.
