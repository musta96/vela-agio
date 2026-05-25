import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

const SECTIONS = [
  { title: "Smart Pick composite score", body: "Weighted blend of technical momentum (40%), fundamental quality (30%), sentiment (20%), and analyst consensus (10%). Normalised cross-sectionally per region. Refresh frequency: daily after close." },
  { title: "Intrinsic value (DCF)", body: "5-year explicit FCF projection using consensus growth → 2% terminal growth. WACC = risk-free + beta × ERP. Sensitivity table on terminal growth and discount rate. Bear/Base/Bull scenarios shift FCF growth ±300 bps." },
  { title: "Dividend Discount Model (DDM)", body: "Two-stage Gordon model. Stage 1: explicit dividend forecast (5y). Stage 2: terminal growth = min(GDP, 3%). Cost of equity from CAPM." },
  { title: "Sentiment model", body: "Tier-1 (Reuters/FT/Bloomberg-class), Tier-2 (national press), retail (X/Reddit). Weighted aggregation, decay half-life 48h. Scores normalised −1 to +1." },
  { title: "Risk: VaR / CVaR / stress", body: "Historical (5y rolling), parametric (normal-MV), and Monte Carlo (10k paths). Stress tests reuse actual historical windows (2008-09, COVID-2020) replayed on current weights." },
  { title: "Backtest engine", body: "Daily close-to-close fills, 5 bps commission + 5 bps slippage by default. Walk-forward optional. Survivorship-bias-aware where possible (US/EU). Past performance is not a guarantee of future results." },
  { title: "AI agents", body: "Lovable AI Gateway (Gemini 2.5 Flash). System prompts disclosed on request. Outputs are advisory and explicitly not financial advice. All agent outputs are logged for audit." },
];

export default function Methodology() {
  return (
    <div className="min-h-screen bg-background">
      <SEO title="Methodology | FTSE MIB Analytics" description="How our scores, models and AI work" path="/methodology" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6 max-w-4xl">
        <div className="flex items-center gap-3"><BookOpen className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">Methodology & Disclosures</h1></div>
        <p className="text-muted-foreground">Full transparency on every model, score and AI output. Built for institutional due-diligence.</p>
        {SECTIONS.map(s => (
          <Card key={s.title}><CardHeader><CardTitle>{s.title}</CardTitle></CardHeader><CardContent><p className="text-sm leading-relaxed">{s.body}</p></CardContent></Card>
        ))}
        <p className="text-xs text-muted-foreground border-t pt-4">Last updated: {new Date().toISOString().split("T")[0]}. All outputs are informational and do not constitute financial advice.</p>
      </main>
    </div>
  );
}