// Auto-curated map of every user-facing route in Vela.ai.
// Kept in source so the Copilot's support-agent persona can answer
// "where do I find X?" without hallucinating.
export const PLATFORM_MAP = `
VELA.AI PLATFORM MAP (every page the user can reach):

CORE
- /               Dashboard — top movers, watchlist snapshot, sentiment heatmap, AI briefing.
- /portfolio      Portfolio — add/edit holdings (manual or AI-resolved tickers), P&L, charts, broker sync via SnapTrade.
- /watchlist      Watchlist — track tickers without owning them; quick AI sentiment per row.
- /macro          Macro — FRED / TradingEconomics global indicators, rates, CPI, GDP, yield curve.
- /explore        Explore (discovery hub) — sticky search across 150k+ symbols (stocks, ETFs, crypto, FX, commodities, bonds via ETFs/yields, futures, indices) plus Trading 212–style rails: Most owned/bought/sold, Big tech, EU defence, Quantum, GLP-1, Luxury, REITs, Italian banks, Top movers, Most traded, US greats, UK's biggest, European giants, Nikkei, Hang Seng, FTSE MIB, Crypto top 10, Forex majors, Commodities, Government bonds, US index futures, Most shorted, High dividend, Small-cap gainers, Growth tech, Undervalued.

ANALYSIS
- /screener       Screener — natural-language + rule-based stock filter across 60+ metrics.
- /backtest       Backtesting — run a strategy over historical bars (SMA cross, RSI, Bollinger, custom).
- /risk           Risk engine — VaR, CVaR, factor exposures, Monte Carlo.
- /tax-harvest    Tax harvest — find loss candidates; respects residency + wash-sale rules.
- /goals          Goals — savings goal tracker with Monte Carlo projection.
- /technical      Technical analysis — multi-indicator chart with RSI/MACD/EMA/Ichimoku.
- /compare        Compare — side-by-side fundamentals & price for up to 4 tickers.
- /sectors        Sector heatmap — daily/weekly/monthly performance.
- /intraday       Intraday — 1m/5m bars + VWAP & opening range.
- /corporate-actions  Dividends, splits, buybacks.
- /optimizer      Mean-variance / Black-Litterman portfolio optimizer.
- /rebalance      Rebalance suggestions vs target weights with tax-aware lot picks.
- /peers          Peer comparison snowflakes.
- /quant          Quant alpha factor explorer (value/momentum/quality/low-vol).
- /event-study    Event study around earnings, M&A, macro prints.
- /advanced-analysis  Advanced Analysis — real OHLCV chart with candlestick patterns, support/resistance, trendlines, order blocks, liquidity sweeps, anchored VWAP, Volume Profile (POC/VAH/VAL), Fibonacci golden zone, configurable detector settings, and a full backtest report on the loaded interval. Deep-linkable with ?symbol=TICKER.
- /strategy-lab   Strategy Lab — rule builder with validation, execution costs (commission/slippage), parameter sensitivity heatmap with drill-down, regime breakdown (trend/range/high-low vol), walk-forward optimisation, version comparison, SMC signal performance report, simulation cache & CPU controls.
- /simulations    Portfolio Monte Carlo & scenario analysis — correlated GBM paths, fan chart, histogram, CDF, VaR/CVaR, tornado sensitivity, signal-adjusted runs.
- /portfolio-compare  Proposed vs Current — overlap, duplication flags, sector/geography exposure, Herfindahl diversification delta, rebalance suggestions.
- /regulatory-analysis  Predictive regulatory analysis — impact of proposed laws, directives and regulatory trends on sectors/companies with scenarios, assumptions, confidence and citations.
- /regional-markets  Regional deep-dive — MENA, APAC, China, Korea, Japan, Latin America, North America and Africa: exchanges, currencies, market hours, macro snapshot, structural drivers, risks and tradable indices/ETFs/stocks/FX.
- /short-selling  Short selling — borrow/short analytics, most-shorted screens, paper short orders and unlimited-loss risk framing.
- /options        Options chain & analytics — Black-Scholes pricing, greeks, payoff diagrams, margin. Deep-link /options/TICKER.
- /futures        Futures — contract specs, curves and quotes.

INTELLIGENCE
- /picks          AI Picks — Smart Picks edge function ranks ideas by score.
- /advisor        AI Advisor — long-form personalized portfolio report (uses MiFID profile).
- /copilot        Conversational Copilot (this assistant, full page).
- /sentiment      Sentiment dashboard — news + social analyzed by AI.
- /dealflow       Deal flow — live M&A, IPO and LBO activity with AI summary.
- /alerts         Alert rules — price/percent/RSI thresholds, push + email.

DATA
- /filings        SEC EDGAR filings search + AI summary.
- /research-analyst  AI Equity Research Analyst — summarise annual reports (10-K/20-F), quarterlies and 8-Ks, analyse pasted earnings-call transcripts, extract and severity-classify risks with per-paragraph citations, tag and search saved research notes, watchlist filing alerts, and diff the latest report vs the previous one.
- /earnings       Earnings calendar + post-earnings drift.
- /insider        Insider trading (Form 4 + 13F).
- /baskets        Thematic baskets (AI, blockchain, defense, etc.).
- /blotter        Trade blotter — paper + (planned) live order log.
- /notes          Personal research notes per ticker.

ACCOUNT
- /suitability    MiFID II suitability questionnaire — feeds risk profile into Copilot/Advisor.
- /onboarding     Step-by-step setup of portfolio, risk, providers.
- /learn          Education hub.
- /methodology    How the scores are computed.
- /api            API docs.
- /settings       Settings — language, theme, BYO API keys (data + AI providers).
- /pricing        Pricing.
- /admin/*        Admin-only — audit log, settings.

TOOLS YOU CAN CALL FOR THESE PAGES (don't just link — run them):
- analyze_technicals → patterns, S/R, order blocks, sweeps, anchored VWAP, Volume Profile, Fibonacci for any ticker.
- run_strategy_backtest → historical backtest with costs and benchmark.
- run_portfolio_simulation → Monte Carlo / scenario analysis on an allocation.
- compare_portfolio_impact → proposed vs existing holdings.
- analyze_filing_or_transcript → AI equity research note from a SEC filing URL or earnings call transcript.
- run_regulatory_analysis → forward-looking regulatory impact report.
- run_thematic_deepdive / run_screener → macro, sector and thematic value-chain discovery across all global regions.
- suggest_hedge + place_paper_order(short_sell=true) → shorting and hedging workflows (paper only).

IMPORTANT FEATURE NOTES:
- All third-party API keys are stored encrypted in Lovable Cloud (vault). Users add them under /settings → Data providers.
- AI provider: defaults to Lovable AI Gateway (no key needed). Users can BYO OpenAI/Anthropic/Gemini/Perplexity/Mistral/Groq.
- Paper trading uses Alpaca (sandbox keys in /settings).
- Broker read-only sync uses SnapTrade (Phase 3) on /portfolio.
- Fuzzy ticker resolution: AI symbol finder on /portfolio when adding instruments.
- LIVE order placement is DISABLED on this platform. Vela.ai is not authorised as an investment firm and never routes real-money orders. Only paper trading (Alpaca sandbox) is supported.
`;