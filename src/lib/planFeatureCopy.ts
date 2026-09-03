/**
 * Hand-written Italian copy for the plan bullet points stored (in English) in
 * `subscription_plans.features`. Keyed by the exact English source string so
 * new/unknown bullets fall back to English instead of being machine-translated
 * at runtime (which produced mixed-language plan cards).
 *
 * Finance terms of art that the Italian market uses in English are left as-is
 * (Screener, Momentum, Sin stocks, Deal Flow, backtesting, alert, broker).
 */
const IT: Record<string, string> = {
  // Explorer
  "Watchlist": "Watchlist",
  "Delayed market data on stock and ETF pages": "Dati di mercato differiti sulle pagine di azioni ed ETF",
  "5 AI research questions per day": "5 domande di ricerca AI al giorno",
  "Educational content and the blog": "Contenuti formativi e blog",
  "No portfolio sync, no live data, no alerts": "Nessuna sincronizzazione del portafoglio, nessun dato live, nessun alert",
  // Plus
  "Everything in Explorer": "Tutto quello incluso in Explorer",
  "Live EU and US market data": "Dati di mercato live Europa e USA",
  "Portfolio tracking with read-only broker connect (Plaid / SnapTrade)":
    "Monitoraggio del portafoglio con collegamento broker in sola lettura (Plaid / SnapTrade)",
  "100 AI research questions per day": "100 domande di ricerca AI al giorno",
  "Sentiment and news summaries": "Sentiment e sintesi delle notizie",
  "Smart alerts on price, signal and events": "Alert intelligenti su prezzo, segnali ed eventi",
  // Pro
  "Everything in Plus": "Tutto quello incluso in Plus",
  "Backtesting and portfolio optimizer": "Backtesting e ottimizzatore di portafoglio",
  "MiFID II suitability checks and KID handling": "Verifiche di adeguatezza MiFID II e gestione dei KID",
  "Research report generation and PDF export": "Generazione di report di ricerca ed esportazione PDF",
  "Tax and performance reports": "Report fiscali e di performance",
  "Priority AI with higher limits and a faster model":
    "AI prioritaria con limiti più alti e un modello più veloce",
  // Elite
  "All premium models (GPT-5, Gemini Pro)": "Tutti i modelli premium (GPT-5, Gemini Pro)",
  "10,000 AI messages/month": "10.000 messaggi AI al mese",
  "Early access to new features": "Accesso anticipato alle nuove funzionalità",
  "Dedicated support": "Supporto dedicato",
  // Enterprise
  "Everything in Pro": "Tutto quello incluso in Pro",
  "Multi-client advisor seats (3 included, add more)":
    "Postazioni advisor multi-cliente (3 incluse, espandibili)",
  "Client-ready compliance and suitability documents":
    "Documenti di compliance e adeguatezza pronti per il cliente",
  "Bulk export and team management": "Esportazione massiva e gestione del team",
  "API access": "Accesso API",
  "Priority support": "Supporto prioritario",
  // Advisor
  "MiFID II suitability + KIDs": "Adeguatezza MiFID II + KID",
  "White-label client portal": "Portale clienti white-label",
  "Model portfolios": "Portafogli modello",
  "Compliance audit log": "Registro di audit per la compliance",
};

export function localizePlanFeature(text: string, lang: string | undefined): string {
  if (!lang || !lang.startsWith("it")) return text;
  return IT[text.trim()] ?? text;
}
