// Catalog of supported third-party API providers.
// Keys themselves are stored ENCRYPTED in Lovable Cloud via the `keys-vault` edge
// function — never in localStorage. This file only describes what we support.

export type ApiKeyCategory = "ai" | "market" | "social";

export interface ApiKeySpec {
  id: string;
  label: string;
  description: string;
  category: ApiKeyCategory;
  docsUrl?: string;
  signupUrl?: string;
  serverOnly?: boolean; // hint that this key is used in server-side calls
}

export const API_KEY_SPECS: ApiKeySpec[] = [
  // --- AI providers ---
  {
    id: "OPENAI_API_KEY",
    label: "OpenAI (ChatGPT)",
    description: "GPT-4 / GPT-5 models for chat, analysis and reasoning.",
    category: "ai",
    signupUrl: "https://platform.openai.com/api-keys",
    serverOnly: true,
  },
  {
    id: "ANTHROPIC_API_KEY",
    label: "Anthropic (Claude)",
    description: "Claude 3.5 / Sonnet / Opus for long-context reasoning.",
    category: "ai",
    signupUrl: "https://console.anthropic.com/settings/keys",
    serverOnly: true,
  },
  {
    id: "GEMINI_API_KEY",
    label: "Google Gemini",
    description: "Gemini 1.5 / 2.5 models from Google AI Studio.",
    category: "ai",
    signupUrl: "https://aistudio.google.com/apikey",
    serverOnly: true,
  },
  {
    id: "PERPLEXITY_API_KEY",
    label: "Perplexity",
    description: "Online LLM with built-in web search and citations.",
    category: "ai",
    signupUrl: "https://www.perplexity.ai/settings/api",
    serverOnly: true,
  },
  {
    id: "MISTRAL_API_KEY",
    label: "Mistral",
    description: "Mistral Large / Codestral models.",
    category: "ai",
    signupUrl: "https://console.mistral.ai/api-keys/",
    serverOnly: true,
  },
  {
    id: "GROQ_API_KEY",
    label: "Groq",
    description: "Ultra-low-latency hosted Llama / Mixtral inference.",
    category: "ai",
    signupUrl: "https://console.groq.com/keys",
    serverOnly: true,
  },

  // --- Market data ---
  {
    id: "ALPHA_VANTAGE_API_KEY",
    label: "Alpha Vantage",
    description: "Fundamentals, intraday and FX. Generous free tier.",
    category: "market",
    signupUrl: "https://www.alphavantage.co/support/#api-key",
  },
  {
    id: "FINNHUB_API_KEY",
    label: "Finnhub",
    description: "Real-time quotes, news, earnings, insider trades.",
    category: "market",
    signupUrl: "https://finnhub.io/dashboard",
  },
  {
    id: "POLYGON_API_KEY",
    label: "Polygon.io",
    description: "US equities, options and crypto market data.",
    category: "market",
    signupUrl: "https://polygon.io/dashboard/api-keys",
  },
  {
    id: "TWELVE_DATA_API_KEY",
    label: "Twelve Data",
    description: "Global equities, forex, crypto, ETFs.",
    category: "market",
    signupUrl: "https://twelvedata.com/account/api-keys",
  },
  {
    id: "FMP_API_KEY",
    label: "Financial Modeling Prep",
    description: "Fundamentals, ratios, DCF, statements.",
    category: "market",
    signupUrl: "https://site.financialmodelingprep.com/developer/docs",
  },
  {
    id: "YAHOO_FINANCE_RAPIDAPI_KEY",
    label: "Yahoo Finance (RapidAPI)",
    description: "Authenticated Yahoo Finance via RapidAPI (extended fundamentals).",
    category: "market",
    signupUrl: "https://rapidapi.com/apidojo/api/yahoo-finance1",
  },
  {
    id: "SEEKING_ALPHA_API_KEY",
    label: "Seeking Alpha (RapidAPI)",
    description: "Seeking Alpha analyst data via RapidAPI.",
    category: "market",
    signupUrl: "https://rapidapi.com/apidojo/api/seeking-alpha",
  },
  {
    id: "ALPACA_API_KEY",
    label: "Alpaca Trading",
    description: "Commission-free US brokerage and paper-trading API.",
    category: "market",
    signupUrl: "https://app.alpaca.markets/paper/dashboard/overview",
    serverOnly: true,
  },
  {
    id: "IB_GATEWAY_TOKEN",
    label: "Interactive Brokers",
    description: "Token / session for IBKR Client Portal Gateway.",
    category: "market",
    signupUrl: "https://www.interactivebrokers.com/en/trading/ib-api.php",
    serverOnly: true,
  },

  // --- Social / news ---
  {
    id: "REDDIT_CLIENT_ID",
    label: "Reddit Client ID",
    description: "OAuth client id for authenticated Reddit reads.",
    category: "social",
    signupUrl: "https://www.reddit.com/prefs/apps",
  },
  {
    id: "REDDIT_CLIENT_SECRET",
    label: "Reddit Client Secret",
    description: "OAuth secret paired with the Reddit client id.",
    category: "social",
    signupUrl: "https://www.reddit.com/prefs/apps",
    serverOnly: true,
  },
  {
    id: "X_BEARER_TOKEN",
    label: "X / Twitter Bearer Token",
    description: "v2 API bearer for tweet search.",
    category: "social",
    signupUrl: "https://developer.x.com/en/portal/dashboard",
    serverOnly: true,
  },
  {
    id: "NEWSAPI_KEY",
    label: "NewsAPI.org",
    description: "Aggregated mainstream and financial news search.",
    category: "social",
    signupUrl: "https://newsapi.org/account",
  },

  // --- Extended market data providers (Phase 2) ---
  { id: "TIINGO_API_KEY", label: "Tiingo", description: "EOD prices, fundamentals, news. Generous free tier.", category: "market", signupUrl: "https://api.tiingo.com/account/api/token" },
  { id: "IEX_CLOUD_API_KEY", label: "IEX Cloud", description: "US equities real-time and reference data.", category: "market", signupUrl: "https://iexcloud.io/console/tokens" },
  { id: "EOD_HISTORICAL_API_KEY", label: "EOD Historical Data", description: "70+ exchanges, fundamentals, dividends, splits.", category: "market", signupUrl: "https://eodhistoricaldata.com/cp/dashboard" },
  { id: "MARKETSTACK_API_KEY", label: "Marketstack", description: "Real-time and historical global equities.", category: "market", signupUrl: "https://marketstack.com/dashboard" },
  { id: "QUANDL_API_KEY", label: "Nasdaq Data Link (Quandl)", description: "Premium datasets: futures, macro, alternative data.", category: "market", signupUrl: "https://data.nasdaq.com/account/profile" },
  { id: "FRED_API_KEY", label: "FRED (St. Louis Fed)", description: "Free macro time series — rates, CPI, GDP, M2.", category: "market", signupUrl: "https://fred.stlouisfed.org/docs/api/api_key.html" },
  { id: "TRADING_ECONOMICS_API_KEY", label: "Trading Economics", description: "Global macro indicators and calendar.", category: "market", signupUrl: "https://tradingeconomics.com/api/" },
  { id: "INTRINIO_API_KEY", label: "Intrinio", description: "US fundamentals, options chains, SEC filings.", category: "market", signupUrl: "https://intrinio.com/account/api-keys" },
  { id: "STOCKDATA_API_KEY", label: "StockData.org", description: "Stocks, news and sentiment.", category: "market", signupUrl: "https://www.stockdata.org/" },
  { id: "SIMPLYWALL_API_KEY", label: "Simply Wall St", description: "Visual fundamental snowflakes and intrinsic value.", category: "market", signupUrl: "https://simplywall.st/account/api" },
  { id: "TRADIER_API_KEY", label: "Tradier", description: "US broker API: quotes, options chains, paper trading.", category: "market", signupUrl: "https://developer.tradier.com/", serverOnly: true },
  { id: "SNAPTRADE_CLIENT_ID", label: "SnapTrade Client ID", description: "Aggregator for 20+ brokers (read-only by default).", category: "market", signupUrl: "https://snaptrade.com/" },
  { id: "SNAPTRADE_CONSUMER_KEY", label: "SnapTrade Consumer Key", description: "Paired with SnapTrade client id.", category: "market", signupUrl: "https://snaptrade.com/", serverOnly: true },
  { id: "PLAID_CLIENT_ID", label: "Plaid Client ID", description: "Plaid Investments aggregator for brokerage sync.", category: "market", signupUrl: "https://dashboard.plaid.com/" },
  { id: "PLAID_SECRET", label: "Plaid Secret", description: "Paired with Plaid client id.", category: "market", signupUrl: "https://dashboard.plaid.com/", serverOnly: true },

  // --- Private markets / research (per-user only — no caching/redistribution) ---
  { id: "CRUNCHBASE_API_KEY", label: "Crunchbase", description: "Private company funding rounds and deal flow.", category: "market", signupUrl: "https://data.crunchbase.com/docs/using-the-api" },
  { id: "PITCHBOOK_API_KEY", label: "PitchBook", description: "M&A, PE/VC deal flow (enterprise).", category: "market", signupUrl: "https://pitchbook.com/" },
  { id: "CBINSIGHTS_API_KEY", label: "CB Insights", description: "Tech market intelligence.", category: "market", signupUrl: "https://www.cbinsights.com/" },
  { id: "ALPHASENSE_API_KEY", label: "AlphaSense", description: "AI search across filings, transcripts, broker research.", category: "market", signupUrl: "https://www.alpha-sense.com/" },

  // --- News & sentiment (extended) ---
  { id: "MARKETAUX_API_KEY", label: "Marketaux", description: "Financial news + entity-tagged sentiment.", category: "social", signupUrl: "https://www.marketaux.com/account/dashboard" },
  { id: "BENZINGA_API_KEY", label: "Benzinga", description: "Real-time news, ratings, analyst actions.", category: "social", signupUrl: "https://cloud.benzinga.com/" },
  { id: "STOCKNEWS_API_KEY", label: "StockNewsAPI", description: "Pre-aggregated stock news with sentiment.", category: "social", signupUrl: "https://stocknewsapi.com/" },
  { id: "POLYGON_NEWS_API_KEY", label: "Polygon News", description: "Reference news feed from Polygon.io.", category: "social", signupUrl: "https://polygon.io/" },
];

// NOTE: All read/write of actual key values now goes through the `keys-vault` edge
// function. The browser only ever sees provider name + last-4 hint. Any legacy
// localStorage values from earlier versions are intentionally NOT migrated, since
// they were unencrypted at rest in the browser.
import { supabase } from "@/integrations/supabase/client";

export interface StoredKeyMeta {
  provider: string;
  hint: string;
  created_at: string;
  updated_at: string;
}

export async function vaultList(): Promise<StoredKeyMeta[]> {
  const { data, error } = await supabase.functions.invoke("keys-vault", {
    body: { action: "list" },
  });
  if (error) throw error;
  return (data?.keys ?? []) as StoredKeyMeta[];
}

export async function vaultSet(provider: string, value: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("keys-vault", {
    body: { action: "set", provider, value },
  });
  if (error) throw error;
  return data?.hint ?? "";
}

export async function vaultDelete(provider: string): Promise<void> {
  const { error } = await supabase.functions.invoke("keys-vault", {
    body: { action: "delete", provider },
  });
  if (error) throw error;
}

// One-time cleanup: purge the old plaintext localStorage blob if present.
if (typeof window !== "undefined") {
  try { localStorage.removeItem("user_api_keys_v1"); } catch { /* ignore */ }
}