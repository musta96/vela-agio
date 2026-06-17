
# Expanded markets + Trading 212–style Explore

Goal: turn Explore from a search-only page into a **discovery hub** like Trading 212's, and widen the universe so it isn't just stocks/ETFs.

---

## 1. Expand the market taxonomy

Update `src/data/marketTaxonomy.ts` so every asset class the user mentioned is first-class:

**New / extended asset classes**
- `equity`, `etf`, `mutual_fund` (already there)
- `crypto` — `BTC-USD`, `ETH-USD`, top ~50 by mcap (Yahoo `*-USD` symbols)
- `fx` — majors + crosses (`EURUSD=X`, `GBPUSD=X`, `USDJPY=X`, …)
- `commodity` — Yahoo continuous futures (`GC=F` gold, `SI=F` silver, `CL=F` WTI, `BZ=F` Brent, `NG=F` natgas, `HG=F` copper, `ZC=F` corn, `ZW=F` wheat, etc.)
- `bond` — government-bond ETFs as the primary entry (TLT, IEF, SHY, BTP10Y proxy via `BTP10.MI` / `IBTL.MI`, Bund via `IS0L.DE`, Gilts via `IGLT.L`) **plus** Yahoo's bond index symbols (`^TNX`, `^IRX`, `^FVX`, `^TYX` for US yields; `IT10Y` / `DE10Y` indices where available)
- `future` — broader futures list beyond commodities (ES=F, NQ=F, YM=F, RTY=F, VX=F)
- `option` — search-only (deep linking; Yahoo doesn't return chains without a paid feed — disclose this)
- `index` — already there, expand the catalog

**New / extended regions & exchanges (covers user's "not exhaustive" point)**
- North America: NYSE, NASDAQ, NYSE American, TSX (`.TO`), TSX Venture (`.V`), CBOE
- Latin America: B3 São Paulo (`.SA`), Mexico (`.MX`), Buenos Aires (`.BA`), Santiago (`.SN`)
- Europe: LSE (`.L`/`.IL`), Euronext Amsterdam/Paris/Brussels/Lisbon/Dublin/Oslo (`.AS .PA .BR .LS .IR .OL`), Xetra/Frankfurt (`.DE .F`), Borsa Italiana (`.MI`), SIX Swiss (`.SW`), BME Madrid (`.MC`), Vienna (`.VI`), Helsinki (`.HE`), Stockholm (`.ST`), Copenhagen (`.CO`), Warsaw (`.WA`), Prague (`.PR`), Budapest (`.BD`), Athens (`.AT`), Istanbul (`.IS`)
- Asia/Pacific: TSE Tokyo (`.T`), HKEX (`.HK`), SGX (`.SI`), KRX Korea (`.KS .KQ`), TWSE (`.TW`), SSE/SZSE (`.SS .SZ`), BSE/NSE India (`.BO .NS`), IDX Jakarta (`.JK`), SET Thailand (`.BK`), ASX (`.AX`), NZX (`.NZ`)
- Middle East / Africa: Tadawul (`.SR`), TASE (`.TA`), JSE (`.JO`), EGX (`.CA`)

This is a centralized list other pages already read from (Movers, Screener), so adding suffixes flows through automatically.

---

## 2. Curated lists (the Trading 212 segmentation)

New file: `src/data/curatedLists.ts` — typed registry of curated rails the Explore page renders. Each rail has `{ id, label, emoji, kind, params }`.

**Kinds**
- `screener` — calls existing `market-movers` edge function with a Yahoo predefined screener id. Built-in Yahoo screeners cover most of what we need:
  - `most_actives` → "Most traded"
  - `day_gainers` → "Top movers ↑"
  - `day_losers` → "Top movers ↓"
  - `aggressive_small_caps`, `growth_technology_stocks`, `undervalued_growth_stocks`, `small_cap_gainers`, `undervalued_large_caps`, `high_yield_dividend`, `most_shorted_stocks`, `portfolio_anchors`, `solid_large_growth_funds` …
  - Region variant: same screener with `region=gb` for UK, `region=de` for Germany, etc.
- `symbols` — static curated symbol list batched through `market-data quote` (used for themes like Big Tech, EU Defence, Quantum, GLP-1, Luxury — extends `THEMATIC_BASKETS`).
- `internal` — derived from our own data (only when the user is logged in / has data): "Most owned", "Most bought", "Most sold" — computed from `portfolio_holdings` and `paper_trades` aggregations. If the user isn't logged in we hide these rails (no fake numbers).
- `upcoming_ipos` — already have an Earnings/Deal-flow surface; reuse `deal-flow` edge function filtered to `kind=IPO` and `status=upcoming`.

**Initial rail set** (matches the screenshots + user list)
- Top of page: a tiny "spotlight" strip with Crude Oil, Gold, BTC, S&P 500 futures (like the screenshot's Crude Oil / Gold chips).
- Most bought · Most owned · Most sold *(if logged in)*
- Most traded (most actives, US + EU tabs)
- Top movers ↑ / ↓
- Upcoming IPOs
- Big tech · EU Defence · Quantum computing · GLP-1 · Luxury · Italian banks · Energy transition (from `THEMATIC_BASKETS`, extended)
- US greats · UK's biggest · European Giants · FTSE MIB · Nikkei 225 · Hang Seng (index constituents already in `INDICES`)
- Crypto top 10 · Forex majors · Commodities · Government bond ETFs
- More lists: Big pharma, Sinful stocks, REIT, Airlines, Automotive, Insurance giants, Low P/E, High dividend, Most shorted, Volatile
- Browse all (existing search): Stocks · ETFs · Crypto · FX · Commodities · Bonds · Futures · Indices

---

## 3. Explore page redesign (`src/pages/Explore.tsx`)

Layout (matches the user's reference screenshots, adapted to our glass-system tokens, not Trading 212 white):

```text
┌─────────────────────────────────────────────────┐
│  [ Search any ticker or name … ]   (sticky)    │
├─────────────────────────────────────────────────┤
│  🛢 Crude  ↗ 0.12%   🥇 Gold ↘ 0.05%   ₿ BTC … │  ← spotlight strip
├─────────────────────────────────────────────────┤
│  ❤️ Most owned   🛍️ Most bought   💔 Most sold │  ← tab rail
│  ┌──────┐ ┌──────┐ ┌──────┐ →                   │  ← horizontal scroll of cards
├─────────────────────────────────────────────────┤
│  👩‍💻 Big tech  🛡️ EU Defence  ⚛️ Quantum  →    │
│  ┌──────┐ ┌──────┐ ┌──────┐ →                   │
├─────────────────────────────────────────────────┤
│  ↕️ Top movers   🚀 Upcoming IPOs   📦 New      │
│  ┌──────┐ ┌──────┐ ┌──────┐ →                   │
├─────────────────────────────────────────────────┤
│  More lists  [Big pharma] [Sinful] [REIT] …    │  ← chip grid
│  Browse all  [Stocks] [ETFs] [Crypto] …        │
└─────────────────────────────────────────────────┘
```

New components (small, each <120 lines):
- `src/components/explore/SpotlightStrip.tsx` — fixed list of "always-watched" symbols, batched quote, horizontal scroll on mobile.
- `src/components/explore/RailGroup.tsx` — a 3-tab section: tabs across the top, active tab's rail of `InstrumentCard`s.
- `src/components/explore/InstrumentCard.tsx` — square card: logo (existing avatar lookup or letter fallback), name, last price with currency sign, signed pct change in green/red — matches screenshot 1.
- `src/components/explore/CategoryChips.tsx` — "More lists" + "Browse all" chip grid.
- Search results UI stays (collapsed under the search bar, expands when user types ≥2 chars — same `symbol-search` flow).

Search results gain an asset-class tab row that now also lists Crypto, FX, Commodities, Bonds, Futures, Indices.

Empty/locked states:
- "Most owned/bought/sold" rails: when not logged in → a single inline card "Sign in to see what investors like you hold" instead of fake numbers.
- "Upcoming IPOs": when `deal-flow` returns nothing → small empty card "No IPOs in the next 14 days".

---

## 4. Data plumbing

- Reuse `market-data` edge function for batched quotes (already supports any Yahoo symbol — crypto `BTC-USD`, FX `EURUSD=X`, futures `GC=F`, ETFs all work). No new edge function needed for those rails.
- Reuse `market-movers` edge function for screener-based rails. Extend its accepted screener ids whitelist to include the new ones above.
- New tiny edge function `popular-instruments` for the **logged-in** rails (Most owned / bought / sold). It runs three aggregations over `portfolio_holdings` and `paper_trades` (last 7 d for bought/sold) and returns the top N symbols with counts. Reads only — RLS bypassed via service role since the result is anonymised counts, never user-level data.
- Lightweight client-side caching: each rail caches its quote batch for 30 s in a `useRef` map keyed by symbol list, so flicking between tabs is instant.

---

## 5. Other surfaces that benefit (touch lightly)

- `src/components/CommandPalette.tsx` — already uses `symbol-search`, so crypto/FX/commodities show up automatically once the asset-class filter on Explore is extended.
- `src/pages/Movers.tsx` — keep as-is; reads from the same `INDICES` map. New indices (e.g. SMI, IBEX, OMX) auto-appear once added.
- `supabase/functions/_shared/platform-map.ts` — update the `/explore` description so the Copilot can guide users to the new rails.
- README + `public/mobile-checklist.md` — one-line note that Explore now covers crypto/FX/commodities/bonds/futures.

---

## 6. Technical details (for the reviewer)

- **No new heavy data dependency.** Everything routes through Yahoo via the existing edge functions — no paid feed required for crypto, FX, commodities or government-bond ETFs.
- **Options chains and single-name bonds (BTP, T-Bills CUSIPs)** are intentionally surfaced through ETFs and yield indices. We disclose in a small footnote that single-name OTC bonds aren't indexed by our free data source.
- **Performance:** rails fetch on-mount; each rail batches up to 8 symbols in one `market-data` call. The spotlight strip plus first 3 rails should make ~4 requests on first paint, then nothing until tab change.
- **Migration:** one new edge function `popular-instruments` (read-only aggregation, no schema change). No DB migration needed.
- **Mobile:** rails are horizontally scrollable with `snap-x`, cards are 152px wide, fits 2.3 cards on a 390px viewport — same density as the screenshots.

---

## 7. Out of scope (explicitly)

- Real-time options chains (needs paid provider — call out as a future Phase).
- Single-name corporate bond search by ISIN/CUSIP (same — needs Bondcliq/ICE).
- Editing the existing 24 thematic baskets visually — we'll just add ~6 new ones (Quantum, Big Pharma, Sinful, REIT, Airlines, Automotive, Insurance, Low P/E, High Dividend) to `THEMATIC_BASKETS` so they appear in both Baskets and Explore.

Approve and I'll implement in this order:
1. Taxonomy + new baskets + curated-list registry
2. `popular-instruments` edge function
3. Explore page redesign with the rail components
4. Platform-map / Copilot copy update
