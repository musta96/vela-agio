# Phase 4 — Coverage, accuracy & compliance

Scoped, non-breaking work. Each item is isolated; nothing rewrites existing pages from scratch.

## A. Bug fixes (small, surgical)

1. **Net-worth total mismatch (Dashboard vs /net-worth)**
   - Audit both code paths. Likely causes: dashboard reads `portfolios` only, while `/net-worth` reads `net_worth_accounts`. Or one applies FX and the other doesn't.
   - Centralise the computation in a single hook `useNetWorthTotal()` that:
     - loads all `net_worth_accounts` for the user,
     - converts every line to the user's `base_currency` via `useFxRate`,
     - subtracts liabilities,
     - returns `{ total, byCategory, currency }`.
   - Use it in both `Index.tsx` (dashboard tile) and `NetWorth.tsx`. Single source of truth.

2. **Currency aggregation bug in Net Worth**
   - Same fix as above: all sums go through FX conversion to base currency before adding.
   - Show original currency badge on each row, but the total is always in base currency.

3. **Italian routing / flash bugs**
   - "Scanner" (IT) → currently maps to AI screener because the translated label collides. Fix the sidebar/command-palette routing to use stable route IDs, not translated labels. Translate the *label* only, never the target route.
   - "Monitor" flashing watchlist: caused by route fallback or a redirect in `App.tsx`. Pin the IT label "Monitor" to the correct destination and remove the transient redirect.

## B. Universal Instrument Explorer (new page `/explore`)

- One page to search **anything** Yahoo indexes: stocks, ETFs, mutual funds, indices, bonds (via funds/ETFs — true OTC bonds aren't on Yahoo, we'll be honest about that), futures, FX, crypto.
- Uses the existing `symbol-search` edge function (already universal — covers 150k+ instruments).
- Filters: asset type, exchange, currency, region.
- Result rows show: symbol, name, exchange, type, currency, last price, 1D %.
- Click → existing `/stock/:symbol` page.
- Add to sidebar under "Markets" as **Explore / Esplora**.
- Compliance note in footer: "Bond OTC coverage limited to listed bond ETFs/funds."

## C. Market Movers page (`/movers`)

- Top gainers, top losers, most active.
- Scope selector: **Index** (FTSE MIB, S&P 500, Nasdaq 100, DAX, CAC 40, FTSE 100, Nikkei 225, Hang Seng, ASX 200, TSX, Bovespa, Sensex, Euro Stoxx 50, MSCI World ETF proxy), **Region** (EU / US / APAC / LATAM / EMEA), or **Global**.
- Backed by a new edge function `market-movers` that uses Yahoo screener endpoints (no key).
- Auto-refresh every 60s during market hours (uses `useMarketClock`).
- Sidebar entry under "Markets" as **Movers / Top & Flop**.

## D. Proper world indices & segmentation

- Replace the hard-coded `Italy / Europe / S&P / Nasdaq / ETF` filter with a structured taxonomy used across Screener, Picks, Compare, Heatmap:
  - **Asset class**: Equity / ETF / Fund / Index / Bond proxy / FX / Crypto / Commodity
  - **Region**: North America, Europe, UK, Switzerland, Japan, Greater China, APAC ex-JP, India, LATAM, MEA
  - **Index membership**: real index constituents (FTSE MIB, S&P 500, Nasdaq 100, Russell 2000, Dow 30, DAX 40, MDAX, CAC 40, AEX, IBEX 35, SMI, FTSE 100, OMX 30, Nikkei 225, TOPIX, HSI, KOSPI, ASX 200, TSX 60, Bovespa, Nifty 50, …)
  - **Sector**: GICS sectors
  - **Style**: Large/Mid/Small cap, Value/Growth, Dividend, ESG
- Define this taxonomy in `src/data/marketTaxonomy.ts`. Existing pages adopt it via a shared `<MarketFilter>` component.

## E. Paper Trading (Lab)

- New section under Lab (or sidebar "Lab → Paper Trading").
- Reuses the existing `portfolios` table — already has `is_simulation` boolean. Mark these portfolios `is_simulation = true`.
- New table `paper_trades` to log virtual buy/sell with timestamp, price (last market), qty, fees.
- Cash balance tracked on the portfolio (new col `paper_cash`, base currency).
- UI: portfolio selector, "New paper portfolio" with starting cash, ticker search, buy/sell modal, position table with live P&L, equity curve.
- Big "PAPER" badge, no real-money wording, full disclaimer per MIFID (educational, no advice).
- Strategies from Backtest can be "deployed to paper" — reuses backtest weights.

## F. Compliance / polish

- Every new page: SEO `<SEO>` tags, AI disclaimer strip where AI is used, "informational only — not investment advice", data attribution (Yahoo Finance), correct H1 + canonical.
- Pages are added to `App.tsx` routes and `AppSidebar.tsx` with proper i18n labels in `en.json` + `it.json`.

## Technical changes (for reference)

```text
NEW
  src/hooks/useNetWorthTotal.ts
  src/pages/Explore.tsx
  src/pages/Movers.tsx
  src/pages/PaperTrading.tsx
  src/components/MarketFilter.tsx
  src/data/marketTaxonomy.ts
  supabase/functions/market-movers/index.ts
  migration: paper_trades table + portfolios.paper_cash column

EDIT
  src/pages/Index.tsx          (use useNetWorthTotal)
  src/pages/NetWorth.tsx       (use useNetWorthTotal, FX-aware totals)
  src/pages/NetWorthCategory.tsx (FX-aware sums)
  src/components/AppSidebar.tsx (Explore, Movers, Paper Trading; fix IT labels)
  src/i18n/en.json + it.json   (stable route IDs, fix "Scanner"/"Monitor")
  src/App.tsx                  (new routes, remove flashing redirect)
  src/pages/Screener.tsx, SmartPicks.tsx, SectorHeatmap.tsx (adopt MarketFilter)
  supabase/config.toml         (register market-movers)
```

## Order of execution

1. Bug fixes (A) — fastest user-visible win.
2. Universal Explorer (B) + Movers (C).
3. Taxonomy refactor (D).
4. Paper trading (E) — biggest feature, last.

Each step is shipped + verified before the next. Nothing existing is removed; only swapped behind shared utilities. Tell me to proceed (or pick a subset) and I'll start with A.
