import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";
import { useTranslation } from "react-i18next";

const ITEMS_EN = [
  { term: "P/E ratio", body: "Price ÷ earnings per share. Tells you how many years of current earnings you're paying for one share. Lower can mean cheap - or in trouble." },
  { term: "EV/EBITDA", body: "Enterprise value ÷ EBITDA. Capital-structure-neutral cousin of P/E. Useful across companies with different debt loads." },
  { term: "Free Cash Flow yield", body: "FCF ÷ market cap. The actual cash a company throws off relative to its price. ≥ 6% is generally attractive." },
  { term: "Sharpe ratio", body: "(Return − risk-free) ÷ volatility. How much extra return per unit of risk. > 1 is good, > 2 is rare and excellent." },
  { term: "Beta", body: "Stock's sensitivity to the market. β = 1 moves with index; β = 1.5 is 50% more volatile; β < 1 is defensive." },
  { term: "VaR (Value at Risk)", body: "The loss you should not exceed 95% (or 99%) of the time over a chosen horizon. Doesn't say how bad the tail can get." },
  { term: "CVaR / Expected Shortfall", body: "Average loss in the worst 5% (or 1%) of outcomes. Captures tail severity that VaR misses." },
  { term: "Drawdown", body: "Drop from peak to trough. Max drawdown is the worst historical peak-to-trough fall - what you'd have lived through." },
  { term: "DCF", body: "Discounted cash flow. Sum the present value of expected future cash flows. Foundation of intrinsic value." },
  { term: "Factor (value, quality, momentum)", body: "Systematic style. Value = cheap, Quality = profitable & low-leverage, Momentum = recent winners. Each pays a premium long-term." },
];
const ITEMS_IT = [
  { term: "Rapporto P/E", body: "Prezzo ÷ utile per azione. Indica quanti anni di utili attuali stai pagando per un'azione. Basso può significare a sconto - o in difficoltà." },
  { term: "EV/EBITDA", body: "Enterprise value ÷ EBITDA. Cugino del P/E neutrale rispetto alla struttura del capitale. Utile fra società con diversi livelli di debito." },
  { term: "Free Cash Flow yield", body: "FCF ÷ capitalizzazione. La cassa che l'azienda genera realmente rispetto al prezzo. ≥ 6% è generalmente attraente." },
  { term: "Indice di Sharpe", body: "(Rendimento − risk-free) ÷ volatilità. Rendimento extra per unità di rischio. > 1 è buono, > 2 è raro ed eccellente." },
  { term: "Beta", body: "Sensibilità del titolo al mercato. β = 1 si muove con l'indice; β = 1,5 è il 50% più volatile; β < 1 è difensivo." },
  { term: "VaR (Value at Risk)", body: "La perdita che non dovresti superare il 95% (o 99%) delle volte sull'orizzonte scelto. Non dice quanto può essere brutta la coda." },
  { term: "CVaR / Expected Shortfall", body: "Perdita media nel peggior 5% (o 1%) dei casi. Cattura la severità della coda che il VaR non vede." },
  { term: "Drawdown", body: "Caduta dal massimo al minimo. Il max drawdown è la peggior caduta storica picco-fondo - quanto avresti dovuto sopportare." },
  { term: "DCF", body: "Discounted cash flow. Somma del valore attuale dei flussi di cassa futuri attesi. Fondamento del valore intrinseco." },
  { term: "Fattori (value, quality, momentum)", body: "Stile sistematico. Value = a sconto, Quality = profittevole e poco indebitato, Momentum = vincenti recenti. Ognuno paga un premio nel lungo periodo." },
];

export default function Education() {
  const { t, i18n } = useTranslation();
  const ITEMS = i18n.resolvedLanguage === "it" ? ITEMS_IT : ITEMS_EN;
  return (
    <div className="min-h-screen bg-background">
      <SEO title="Learn | Vela.ai" description="Plain-English explanations of every metric" path="/learn" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6 max-w-3xl">
        <div className="flex items-center gap-3"><GraduationCap className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">{t("pages.learn.title")}</h1></div>
        <p className="text-muted-foreground">{t("pages.learn.subtitle")}</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {ITEMS.map(i => (
            <Card key={i.term}><CardHeader className="pb-2"><CardTitle className="text-base">{i.term}</CardTitle></CardHeader><CardContent><p className="text-sm leading-relaxed">{i.body}</p></CardContent></Card>
          ))}
        </div>
      </main>
    </div>
  );
}