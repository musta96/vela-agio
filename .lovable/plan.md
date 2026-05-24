### What we're fixing
1. **Sentiment is mock and static** — no real news, no per-stock context.
2. **Sentiment & Backtest have no context selector** — they don't ask which stock or portfolio they refer to.
3. **No way to discover promising opportunities** — need an AI recommender that weighs technicals, fundamentals, chart trend, and sentiment.

### Approach
Enable **Lovable Cloud + Lovable AI** so we can run real AI analysis server-side without exposing keys, then wire three new flows on top of the data we already have (Yahoo live quotes + historical bars + the global catalog).

### 1. Backend — three edge functions
- `analyze-sentiment` — input: `symbol` (or list). Pulls recent headlines via Yahoo's RSS feed for that ticker (no key needed), sends to Lovable AI with a strict JSON-tool schema, returns `{score, label, summary, articles[], drivers[]}`.
- `backtest-strategy` — input: `symbol(s)`, `strategy` (SMA crossover / RSI / Buy & Hold), `range`. Fetches historical bars (existing endpoint), runs the simulation in the function, returns equity curve, trade list, Sharpe-like metric, drawdown.
- `smart-picks` — input: optional `market` filter and `riskProfile` (conservative/balanced/aggressive). For a shortlist of catalog tickers, computes technicals (1M/3M/6M return, SMA20 vs SMA50, RSI, volatility) from live history, fetches latest news sentiment, then asks Lovable AI to rank the top N with rationale and a confidence score. Returns ranked list with reasoning.

All three use `google/gemini-3-flash-preview` (default) with tool-calling for structured JSON output. CORS + 402/429 handling included.

### 2. Frontend — Sentiment Dashboard rebuild
- Add a **stock/portfolio context picker** at the top (search catalog or pick from Watchlist/Portfolio).
- When a symbol is selected, call `analyze-sentiment` and render: overall score gauge, key drivers, list of real headlines with per-article sentiment, source links.
- "Refresh" button + auto-refresh every 5 min. Loading skeletons. Empty state if nothing selected.

### 3. Frontend — Backtesting Module rebuild
- Require a **selection step** first: single ticker OR a portfolio (uses Portfolio holdings as weighted basket).
- Strategy dropdown (SMA crossover, RSI mean reversion, Buy & Hold) + parameter sliders + date range.
- "Run Backtest" → calls `backtest-strategy`, renders equity curve vs buy & hold, KPIs (CAGR, Sharpe, max drawdown, win rate), trade log.
- Empty state when nothing is selected.

### 4. Frontend — new "Smart Picks" page
- New nav entry **AI Picks** (route `/picks`).
- Controls: market filter (All / FTSE MIB / Europe / NASDAQ / S&P 500 / ETF), risk profile, time horizon.
- "Generate picks" → calls `smart-picks`, shows ranked cards with: ticker, name, current price, AI confidence bar, bull thesis bullets, risk bullets, links to stock details + add-to-watchlist.
- Disclaimer footer ("educational, not financial advice").

### 5. Small UX glue
- Make "Sentiment Tracking" feature card on home navigate to the picker.
- Add an "Analyze sentiment" button on StockDetails that opens that ticker in the Sentiment page.
- Add a "Backtest this stock" button on StockDetails.

### Technical notes
- Cloud must be enabled before edge functions can be created.
- `LOVABLE_API_KEY` is auto-provisioned — no user input needed.
- News source: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=<SYMBOL>&region=US&lang=en-US` (fetched server-side, no CORS).
- All AI calls happen server-side; the client only calls our edge functions via `supabase.functions.invoke`.
- Smart picks scoring keeps the candidate set bounded (≤25 tickers per request) to control latency and cost.

### Out of scope
- Real-time WebSocket pushes (kept polling).
- Saving picks/backtest history to a database (can add later).
- Multi-user auth (separate feature).
