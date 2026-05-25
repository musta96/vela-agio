import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";

const ITEMS = [
  { term: "P/E ratio", body: "Price ÷ earnings per share. Tells you how many years of current earnings you're paying for one share. Lower can mean cheap — or in trouble." },
  { term: "EV/EBITDA", body: "Enterprise value ÷ EBITDA. Capital-structure-neutral cousin of P/E. Useful across companies with different debt loads." },
  { term: "Free Cash Flow yield", body: "FCF ÷ market cap. The actual cash a company throws off relative to its price. ≥ 6% is generally attractive." },
  { term: "Sharpe ratio", body: "(Return − risk-free) ÷ volatility. How much extra return per unit of risk. > 1 is good, > 2 is rare and excellent." },
  { term: "Beta", body: "Stock's sensitivity to the market. β = 1 moves with index; β = 1.5 is 50% more volatile; β < 1 is defensive." },
  { term: "VaR (Value at Risk)", body: "The loss you should not exceed 95% (or 99%) of the time over a chosen horizon. Doesn't say how bad the tail can get." },
  { term: "CVaR / Expected Shortfall", body: "Average loss in the worst 5% (or 1%) of outcomes. Captures tail severity that VaR misses." },
  { term: "Drawdown", body: "Drop from peak to trough. Max drawdown is the worst historical peak-to-trough fall — what you'd have lived through." },
  { term: "DCF", body: "Discounted cash flow. Sum the present value of expected future cash flows. Foundation of intrinsic value." },
  { term: "Factor (value, quality, momentum)", body: "Systematic style. Value = cheap, Quality = profitable & low-leverage, Momentum = recent winners. Each pays a premium long-term." },
];

export default function Education() {
  return (
    <div className="min-h-screen bg-background">
      <SEO title="Learn | FTSE MIB Analytics" description="Plain-English explanations of every metric" path="/learn" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6 max-w-3xl">
        <div className="flex items-center gap-3"><GraduationCap className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">Learn</h1></div>
        <p className="text-muted-foreground">Every metric on the platform, explained in 1-2 sentences.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {ITEMS.map(i => (
            <Card key={i.term}><CardHeader className="pb-2"><CardTitle className="text-base">{i.term}</CardTitle></CardHeader><CardContent><p className="text-sm leading-relaxed">{i.body}</p></CardContent></Card>
          ))}
        </div>
      </main>
    </div>
  );
}