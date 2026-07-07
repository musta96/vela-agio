# Comprehensive Portfolio Memo — v2

Turn the memo generator into a single, source-cited, multi-section PDF that combines the holistic strategy and (optionally) selected per-instrument deep-dives, with a real progress UI, caching, incremental regeneration, and a persistent Documents library.

## What the user gets

1. One PDF with: Cover · Table of contents · Executive summary · Macro context (base/bull/bear) · Allocation table · Correlation heatmap + key drivers · Portfolio-level VaR/CVaR & scenarios (when a simulation is provided) · Per-instrument deep-dive appendix (only the tickers they pick) · Assumptions & data-sources appendix.
2. Inline source citations on every fundamentals / valuation / news claim, with a matching numbered references list at the end.
3. A live progress panel while generating: per-ticker status (queued / fetching / cached / failed / retrying / done) with automatic retry for transient failures.
4. A **Documents** page listing every generated memo — preview, re-download, delete, regenerate.
5. An **Update changed instruments only** action that re-fetches just the tickers whose fundamentals/quotes have moved and produces a new PDF version, leaving the strategy/macro/allocation sections identical.

## Sections & structure

| Section | Source | Notes |
|---|---|---|
| Cover | user inputs | title, base ccy, generated_at, confidential badge |
| TOC | derived | auto-numbered |
| Executive summary | thesis + AI polish | cites nothing new |
| Macro context | new `macro-outlook` edge function | base/bull/bear paragraphs + cited FRED/ECB series |
| Allocation | user allocation | table + weight bar |
| Correlation | `market-data` ohlc for each symbol | Pearson matrix, heatmap PNG, top-3 diversifying & top-3 concentrating pairs |
| Portfolio risk | `opts.simulation` | VaR95/99, CVaR95/99, MC percentiles, scenario impacts from `scenarioPresets` |
| Instrument deep-dive | `deep-analysis` per selected ticker | fundamentals, DCF/DDM, thesis, bull/bear, risks, sentiment; each claim ⁽ⁿ⁾ cited |
| Assumptions & data sources | derived | model versions, cache ages, endpoint list, disclaimers |

## Citations model

Every rendered claim carries a numeric marker like `⁽3⁾`. The server collects unique `{label, url, retrieved_at}` entries into a single references list rendered on the last page. The edge functions already returning data (`deep-analysis`, `market-data`, `analyze-sentiment`, `macro-series`) are extended to return a `sources: {label,url,retrieved_at}[]` alongside their payload so the memo builder can attach them to the corresponding fields without hard-coding URLs.

## Caching

New table `memo_instrument_cache`:

```text
user_id uuid, ticker text, cache_date date, payload jsonb, sources jsonb,
fingerprint text, created_at timestamptz
PRIMARY KEY (user_id, ticker, cache_date)
```

- `cache_date = current_date` (per-day granularity — fundamentals don't move intraday enough to matter for a memo).
- `fingerprint` = SHA-256 of `{price, marketCap, epsForward, dcfIntrinsic}` — used to detect "changed since last memo" for incremental regeneration.
- RLS: user reads/writes only their own rows; edge function uses service role.
- Same pattern extended to `market_data_cache` for the correlation matrix (already exists — reuse it).

## Progress + retry

- Builder opens a new `<MemoGenerationProgress>` panel that renders one row per ticker with a status chip.
- Client fires all `deep-analysis` calls through a small `withRetry(fn, {attempts: 3, backoffMs: [500, 1500, 4000]})` helper.
- On per-ticker failure after retries, the row stays red with a Retry button; the PDF still renders and the failed ticker is listed under "Data gaps" in the Assumptions appendix.

## Incremental regeneration

- Each generated memo persists a manifest row in `generated_memos` (see below) including the per-ticker fingerprints used.
- On the Documents page, a "Refresh changed instruments" button re-runs `deep-analysis` for that memo's tickers, diffs new vs. saved fingerprints, and rebuilds only those instrument sections. Non-instrument sections are cloned verbatim. A new versioned file (`memo_v2.pdf`) is stored.

## Documents library

New table `generated_memos`:

```text
id uuid pk, user_id uuid, title text, base_currency text,
storage_path text, pdf_bytes int, sections jsonb, tickers text[],
fingerprints jsonb, parent_id uuid null, version int default 1,
created_at timestamptz default now()
```

New private storage bucket `memos`. The `generate-memo-pdf` edge function uploads the rendered PDF under `memos/{user_id}/{memo_id}_v{n}.pdf` and inserts the manifest row. A new `/documents` route lists the user's memos with preview, download, regenerate, and delete actions.

## Configurable per-instrument appendix

`PortfolioMemoBuilder` gains a "Deep-dive tickers" section (checkbox list of the allocation symbols, all-off by default). Only checked tickers get a deep-dive page and consume `deep-analysis` credits.

## Files to add / edit

- add `supabase/migrations/<ts>_memo_documents.sql` — `memo_instrument_cache`, `generated_memos`, `memos` bucket, RLS + GRANTs.
- add `supabase/functions/macro-outlook/index.ts` — base/bull/bear paragraphs (Lovable AI) + FRED/ECB source list.
- edit `supabase/functions/deep-analysis/index.ts` — return `sources: []` and honour `?since=` for cache re-use.
- edit `supabase/functions/generate-memo-pdf/index.ts` — new sections (TOC, macro, correlation heatmap, portfolio risk, references, assumptions), citation renderer, storage upload + manifest insert.
- edit `src/lib/memo/schema.ts` — add `macro`, `correlation`, `portfolio_risk`, `sources`, `assumptions`.
- edit `src/lib/memo/adapter.ts` — pass deep-dive selection, fingerprints, sources.
- add `src/components/memo/MemoGenerationProgress.tsx` — per-ticker status panel.
- add `src/lib/memo/withRetry.ts`.
- edit `src/components/PortfolioMemoBuilder.tsx` — checkbox list, progress panel, incremental option.
- add `src/pages/Documents.tsx` + route entry — list / preview / re-download / regenerate.
- add `src/hooks/useGeneratedMemos.ts`.

## Out of scope for this iteration

- Custom user-supplied source URLs.
- Streaming PDF generation.
- Multi-user shared memo library.

## Estimated impact

~1 new page (Documents), ~2 new edge functions/enhancements, 1 migration, ~7 new/edited components/libs, ~600 new lines of PDF template. No breaking changes to existing memo callers — new fields are optional.
