// Local-only API key store for the Settings page.
// Keys live in the browser (localStorage) so the user can plug their own
// LLM / market-data providers without exposing them in the codebase.
// Anything truly sensitive should go through Lovable Cloud secrets instead.

export type ApiKeyCategory = "ai" | "market" | "social";

export interface ApiKeySpec {
  id: string;
  label: string;
  description: string;
  category: ApiKeyCategory;
  docsUrl?: string;
  signupUrl?: string;
  serverOnly?: boolean; // true => recommend storing as Lovable Cloud secret instead of localStorage
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
];

const STORAGE_KEY = "user_api_keys_v1";

export function loadApiKeys(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function saveApiKey(id: string, value: string) {
  const all = loadApiKeys();
  if (value) all[id] = value;
  else delete all[id];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function clearApiKey(id: string) {
  saveApiKey(id, "");
}

export function getApiKey(id: string): string | undefined {
  return loadApiKeys()[id];
}