import { useState } from "react";
import { Link } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { REGIONAL_MARKETS } from "@/data/regionalMarkets";
import { Globe2, ArrowRight, AlertTriangle, TrendingUp, Clock, Landmark, Coins } from "lucide-react";

export default function RegionalMarkets() {
  const [active, setActive] = useState(REGIONAL_MARKETS[0].id);
  const region = REGIONAL_MARKETS.find((r) => r.id === active) ?? REGIONAL_MARKETS[0];

  return (
    <div className="p-4 sm:p-8 space-y-6 min-w-0">
      <SEO
        title="Regional Markets — MENA, APAC, China, LatAm, Africa | Vela.ai"
        description="Granular analysis tools for MENA, APAC, China, Latin America and Africa: key instruments, macro drivers, regional risks and market structure."
        path="/regional-markets"
      />
      <PageHeader
        icon={Globe2}
        title="Regional Markets"
        description="High-growth regions with region-specific drivers, risks and tradable instruments. Open any instrument in Advanced Analysis for signals and backtests."
      />

      <div className="flex flex-wrap gap-2">
        {REGIONAL_MARKETS.map((r) => (
          <button
            key={r.id}
            onClick={() => setActive(r.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors border ${
              r.id === active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/40 text-foreground border-border hover:bg-muted"
            }`}
          >
            {r.name}
          </button>
        ))}
      </div>

      <Card className="p-5 rounded-2xl space-y-2">
        <h2 className="text-xl font-semibold">{region.name}</h2>
        <p className="text-sm text-muted-foreground max-w-3xl">{region.blurb}</p>
        <div className="grid gap-3 sm:grid-cols-3 pt-2 text-sm">
          <div className="flex items-start gap-2"><Landmark className="h-4 w-4 mt-0.5 text-primary" /><div><p className="text-xs text-muted-foreground">Exchanges</p><p>{region.exchanges}</p></div></div>
          <div className="flex items-start gap-2"><Coins className="h-4 w-4 mt-0.5 text-primary" /><div><p className="text-xs text-muted-foreground">Currencies</p><p>{region.currencies.join(", ")}</p></div></div>
          <div className="flex items-start gap-2"><Clock className="h-4 w-4 mt-0.5 text-primary" /><div><p className="text-xs text-muted-foreground">Market hours</p><p>{region.marketHours}</p></div></div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5 rounded-2xl">
          <h3 className="text-sm font-semibold mb-3">Macro snapshot</h3>
          <div className="space-y-3">
            {region.macroSnapshot.map((m) => (
              <div key={m.label} className="border-l-2 border-primary/40 pl-3">
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="text-sm font-medium">{m.value}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5 rounded-2xl">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-success" /> Structural drivers</h3>
          <ul className="space-y-2 text-sm list-disc pl-4 text-muted-foreground">
            {region.structuralDrivers.map((d) => <li key={d}>{d}</li>)}
          </ul>
        </Card>
        <Card className="p-5 rounded-2xl">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Key regional risks</h3>
          <ul className="space-y-2 text-sm list-disc pl-4 text-muted-foreground">
            {region.keyRisks.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </Card>
      </div>

      <Card className="p-5 rounded-2xl">
        <h3 className="text-sm font-semibold mb-3">Key instruments</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2">Symbol</th><th className="pb-2">Name</th><th className="pb-2">Type</th><th className="pb-2">Note</th><th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {region.instruments.map((i) => (
                <tr key={i.symbol} className="border-b border-border/50">
                  <td className="py-2 font-mono font-medium">{i.symbol}</td>
                  <td className="py-2">{i.name}</td>
                  <td className="py-2 text-muted-foreground">{i.kind}</td>
                  <td className="py-2 text-muted-foreground">{i.note}</td>
                  <td className="py-2 text-right">
                    <Link
                      to={`/advanced-analysis?symbol=${encodeURIComponent(i.symbol)}`}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Analyze <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Coverage varies by data provider; some local indices and frontier ETFs may have delayed or partial history.
        </p>
      </Card>
    </div>
  );
}
