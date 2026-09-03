/**
 * Trading / broker terminology glossary.
 *
 * Rule: keep the English term as the *label* when that is the Italian market
 * convention (order flow, order block, POC, AVWAP, Fibonacci, screener,
 * momentum, spread, drawdown...). Italian traders read and speak these in
 * English; translating them ("Nucleo DAX", "Peccaminoso", "Flusso di affari")
 * was one of the runtime-translation defects. Instead we attach a hand-written
 * Italian *gloss* so the meaning is clear without mangling the term.
 *
 * A few terms DO have a standard Italian label and are translated outright
 * (`itLabel`).
 */
export type GlossaryEntry = {
  /** Canonical English label (kept as-is unless `itLabel` is set). */
  label: string;
  /** Italian label when the Italian market really does translate the term. */
  itLabel?: string;
  /** One-line explanation. */
  en: string;
  it: string;
};

export const FINANCE_GLOSSARY = {
  orderFlow: {
    label: "Order flow",
    en: "Flow of executed buy vs sell orders — shows where aggressive traders are hitting the book.",
    it: "Flusso degli ordini eseguiti in acquisto e in vendita: mostra dove gli operatori aggressivi colpiscono il book.",
  },
  orderBlock: {
    label: "Order block",
    en: "The last opposing candle before an impulsive move — an area where institutional orders were filled.",
    it: "L'ultima candela opposta prima di un movimento impulsivo: la zona in cui sono stati eseguiti ordini istituzionali. Spesso agisce da supporto o resistenza al ritest.",
  },
  avwap: {
    label: "Anchored VWAP (AVWAP)",
    en: "Volume-weighted average price anchored to a chosen event, not to the session open.",
    it: "Prezzo medio ponderato per i volumi (VWAP) ancorato a un evento scelto — per esempio un massimo, un minimo o una trimestrale — invece che all'apertura della seduta.",
  },
  vwap: {
    label: "VWAP",
    en: "Volume-weighted average price over the period.",
    it: "Prezzo medio ponderato per i volumi scambiati nel periodo.",
  },
  poc: {
    label: "POC",
    en: "Point of Control — the price level with the highest traded volume in the profile.",
    it: "Point of Control: il livello di prezzo con il maggior volume scambiato nel profilo. È il prezzo di massimo consenso fra compratori e venditori.",
  },
  vah: {
    label: "VAH",
    en: "Value Area High — upper bound of the 70% volume value area.",
    it: "Value Area High: limite superiore dell'area di valore che contiene il 70% dei volumi.",
  },
  val: {
    label: "VAL",
    en: "Value Area Low — lower bound of the 70% volume value area.",
    it: "Value Area Low: limite inferiore dell'area di valore che contiene il 70% dei volumi.",
  },
  volumeProfile: {
    label: "Volume profile",
    itLabel: "Profilo dei volumi",
    en: "Distribution of traded volume by price level instead of by time.",
    it: "Distribuzione dei volumi scambiati per livello di prezzo anziché per tempo.",
  },
  fibonacci: {
    label: "Fibonacci",
    en: "Retracement and extension levels (38.2%, 50%, 61.8%) drawn on a price swing.",
    it: "Livelli di ritracciamento ed estensione (38,2%, 50%, 61,8%) tracciati su un'oscillazione di prezzo, usati per individuare zone di rientro e obiettivi.",
  },
  liquiditySweep: {
    label: "Liquidity sweep",
    en: "A spike beyond a prior high/low that triggers stop orders before price reverses.",
    it: "Estensione oltre un massimo o minimo precedente che innesca gli stop loss accumulati, seguita spesso da un'inversione. In italiano si parla di \"caccia agli stop\".",
  },
  smc: {
    label: "Smart Money Concepts (SMC)",
    en: "Framework reading structure, liquidity and institutional order zones.",
    it: "Approccio che legge struttura di mercato, liquidità e zone di ordini istituzionali.",
  },
  bos: {
    label: "Break of structure (BOS)",
    en: "Price closing beyond the previous swing point, confirming trend continuation.",
    it: "Rottura di struttura: chiusura oltre il precedente punto di swing, conferma la continuazione del trend.",
  },
  fvg: {
    label: "Fair value gap (FVG)",
    en: "Three-candle imbalance left by an aggressive move; often revisited.",
    it: "Squilibrio a tre candele lasciato da un movimento aggressivo (gap di valore equo), spesso ricoperto in seguito.",
  },
  spread: {
    label: "Spread",
    en: "Difference between two prices or yields (bid/ask, or two instruments).",
    it: "Differenza fra due prezzi o due rendimenti (denaro/lettera, oppure fra due strumenti).",
  },
  drawdown: {
    label: "Drawdown",
    en: "Peak-to-trough decline of the equity curve.",
    it: "Perdita massima dal picco al minimo successivo della curva dei rendimenti.",
  },
  slippage: {
    label: "Slippage",
    en: "Difference between expected and actual execution price.",
    it: "Differenza fra il prezzo atteso e quello di effettiva esecuzione.",
  },
  shortSelling: {
    label: "Short selling",
    en: "Selling borrowed securities to profit from a price decline.",
    it: "Vendita allo scoperto: si vendono titoli presi in prestito per guadagnare da un ribasso.",
  },
} satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof FINANCE_GLOSSARY;

/** Label to display: Italian only where the market convention is Italian. */
export function glossaryLabel(key: GlossaryKey, lang?: string): string {
  const e = FINANCE_GLOSSARY[key] as GlossaryEntry;
  return lang?.startsWith("it") && e.itLabel ? e.itLabel : e.label;
}

export function glossaryDescription(key: GlossaryKey, lang?: string): string {
  const e = FINANCE_GLOSSARY[key] as GlossaryEntry;
  return lang?.startsWith("it") ? e.it : e.en;
}
