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

INTELLIGENCE
- /picks          AI Picks — Smart Picks edge function ranks ideas by score.
- /advisor        AI Advisor — long-form personalized portfolio report (uses MiFID profile).
- /copilot        Conversational Copilot (this assistant, full page).
- /sentiment      Sentiment dashboard — news + social analyzed by AI.
- /dealflow       Deal flow — live M&A, IPO and LBO activity with AI summary.
- /alerts         Alert rules — price/percent/RSI thresholds, push + email.

DATA
- /filings        SEC EDGAR filings search + AI summary.
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

IMPORTANT FEATURE NOTES:
- All third-party API keys are stored encrypted in Lovable Cloud (vault). Users add them under /settings → Data providers.
- AI provider: defaults to Lovable AI Gateway (no key needed). Users can BYO OpenAI/Anthropic/Gemini/Perplexity/Mistral/Groq.
- Paper trading uses Alpaca (sandbox keys in /settings).
- Broker read-only sync uses SnapTrade (Phase 3) on /portfolio.
- Fuzzy ticker resolution: AI symbol finder on /portfolio when adding instruments.
- LIVE order placement is DISABLED on this platform. Vela.ai is not authorised as an investment firm and never routes real-money orders. Only paper trading (Alpaca sandbox) is supported.
`;