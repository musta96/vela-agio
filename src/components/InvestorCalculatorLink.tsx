import { Link } from "react-router-dom";
import { Calculator, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InvestorCalculatorLink() {
  return <div lang="it" className="flex min-w-0 flex-wrap items-center justify-between gap-4 border-y border-border bg-background px-4 py-5 text-foreground sm:px-6">
    <div className="flex min-w-0 items-start gap-3">
      <Calculator className="mt-1 h-5 w-5 shrink-0 text-primary" />
      <div><p className="text-xs font-semibold uppercase text-muted-foreground">Strumento gratuito</p>
        <p className="mt-1 font-semibold">Calcolatore PAC e guida per investitori italiani</p>
        <p className="mt-1 text-sm text-muted-foreground">Versamenti, costi e inflazione. Nessuna registrazione.</p>
      </div>
    </div>
    <Button asChild variant="outline" className="shrink-0 gap-2"><Link to="/calcolatore-pac">Calcola il tuo PAC <ArrowUpRight className="h-4 w-4" /></Link></Button>
  </div>;
}