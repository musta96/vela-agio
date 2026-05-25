import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

const SECTIONS_EN = [
  { title: "Smart Pick composite score", body: "Weighted blend of technical momentum (40%), fundamental quality (30%), sentiment (20%), and analyst consensus (10%). Normalised cross-sectionally per region. Refresh frequency: daily after close." },
  { title: "Intrinsic value (DCF)", body: "5-year explicit FCF projection using consensus growth → 2% terminal growth. WACC = risk-free + beta × ERP. Sensitivity table on terminal growth and discount rate. Bear/Base/Bull scenarios shift FCF growth ±300 bps." },
  { title: "Dividend Discount Model (DDM)", body: "Two-stage Gordon model. Stage 1: explicit dividend forecast (5y). Stage 2: terminal growth = min(GDP, 3%). Cost of equity from CAPM." },
  { title: "Sentiment model", body: "Tier-1 (Reuters/FT/Bloomberg-class), Tier-2 (national press), retail (X/Reddit). Weighted aggregation, decay half-life 48h. Scores normalised −1 to +1." },
  { title: "Risk: VaR / CVaR / stress", body: "Historical (5y rolling), parametric (normal-MV), and Monte Carlo (10k paths). Stress tests reuse actual historical windows (2008-09, COVID-2020) replayed on current weights." },
  { title: "Backtest engine", body: "Daily close-to-close fills, 5 bps commission + 5 bps slippage by default. Walk-forward optional. Survivorship-bias-aware where possible (US/EU). Past performance is not a guarantee of future results." },
  { title: "AI agents", body: "Lovable AI Gateway (Gemini 2.5 Flash). System prompts disclosed on request. Outputs are advisory and explicitly not financial advice. All agent outputs are logged for audit." },
];
const SECTIONS_IT = [
  { title: "Punteggio composito Smart Pick", body: "Mix ponderato di momentum tecnico (40%), qualità fondamentale (30%), sentiment (20%) e consenso degli analisti (10%). Normalizzato per regione. Aggiornato giornalmente a fine seduta." },
  { title: "Valore intrinseco (DCF)", body: "Proiezione esplicita dei FCF a 5 anni con crescita di consenso → crescita terminale 2%. WACC = risk-free + beta × ERP. Tabella di sensibilità su crescita terminale e tasso di sconto. Scenari Bear/Base/Bull spostano i FCF di ±300 bps." },
  { title: "Modello Dividend Discount (DDM)", body: "Gordon a due stadi. Stadio 1: previsione esplicita dei dividendi (5 anni). Stadio 2: crescita terminale = min(PIL, 3%). Costo del capitale via CAPM." },
  { title: "Modello di sentiment", body: "Tier-1 (Reuters/FT/Bloomberg), Tier-2 (stampa nazionale), retail (X/Reddit). Aggregazione ponderata, decadimento 48h. Punteggio normalizzato −1 / +1." },
  { title: "Rischio: VaR / CVaR / stress", body: "Storico (rolling 5 anni), parametrico (normale-MV) e Monte Carlo (10k percorsi). Gli stress test rieseguono finestre storiche reali (2008-09, COVID-2020) sui pesi correnti." },
  { title: "Motore di backtest", body: "Esecuzione close-to-close giornaliera, commissione 5 bps + slippage 5 bps di default. Walk-forward opzionale. Attenzione al survivorship bias dove possibile (US/EU). I rendimenti passati non garantiscono risultati futuri." },
  { title: "Agenti AI", body: "Lovable AI Gateway (Gemini 2.5 Flash). System prompt disponibili su richiesta. Gli output sono informativi e non costituiscono consulenza finanziaria. Tutti gli output sono registrati per audit." },
];

export default function Methodology() {
  const { t, i18n } = useTranslation();
  const sections = i18n.resolvedLanguage === "it" ? SECTIONS_IT : SECTIONS_EN;
  return (
    <div className="min-h-screen bg-background">
      <SEO title="Methodology | Vela.ai" description="How our scores, models and AI work" path="/methodology" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6 max-w-4xl">
        <div className="flex items-center gap-3"><BookOpen className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">{t("pages.methodology.title")}</h1></div>
        <p className="text-muted-foreground">{t("pages.methodology.subtitle")}</p>
        {sections.map(s => (
          <Card key={s.title}><CardHeader><CardTitle>{s.title}</CardTitle></CardHeader><CardContent><p className="text-sm leading-relaxed">{s.body}</p></CardContent></Card>
        ))}
        <p className="text-xs text-muted-foreground border-t pt-4">{t("pages.methodology.updated")}: {new Date().toISOString().split("T")[0]}. {t("common.notFinancialAdvice")}</p>
      </main>
    </div>
  );
}