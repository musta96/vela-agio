import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { Globe2 } from "lucide-react";

const GROUPS: { title: string; symbols: { s: string; label: string }[] }[] = [
  { title: "Rates", symbols: [
    { s: "^TNX", label: "US 10Y" }, { s: "^FVX", label: "US 5Y" }, { s: "^IRX", label: "US 3M" }, { s: "^TYX", label: "US 30Y" },
  ]},
  { title: "FX", symbols: [
    { s: "EURUSD=X", label: "EUR/USD" }, { s: "GBPUSD=X", label: "GBP/USD" }, { s: "USDJPY=X", label: "USD/JPY" }, { s: "USDCHF=X", label: "USD/CHF" },
  ]},
  { title: "Commodities", symbols: [
    { s: "GC=F", label: "Gold" }, { s: "SI=F", label: "Silver" }, { s: "CL=F", label: "WTI Oil" }, { s: "NG=F", label: "Nat Gas" },
  ]},
  { title: "Indices & Vol", symbols: [
    { s: "^GSPC", label: "S&P 500" }, { s: "^FTMIB", label: "FTSE MIB" }, { s: "^STOXX50E", label: "Euro Stoxx 50" }, { s: "^VIX", label: "VIX" },
  ]},
  { title: "Crypto / Alt", symbols: [
    { s: "BTC-USD", label: "Bitcoin" }, { s: "ETH-USD", label: "Ethereum" }, { s: "DX-Y.NYB", label: "DXY" }, { s: "^MOVE", label: "MOVE" },
  ]},
];

export default function Macro() {
  const allSyms = GROUPS.flatMap(g => g.symbols.map(x => x.s));
  const { quotes } = useLiveQuotes(allSyms, 30_000);

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Macro Dashboard | FTSE MIB Analytics" description="Rates, FX, commodities, credit, vol" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3"><Globe2 className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">Macro & Cross-Asset</h1></div>
        {GROUPS.map(g => (
          <div key={g.title}>
            <h2 className="text-lg font-semibold mb-2">{g.title}</h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
              {g.symbols.map(({ s, label }) => {
                const q = quotes[s];
                const chg = q?.changePercent ?? 0;
                return (
                  <Card key={s}>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
                    <CardContent>
                      <div className="text-2xl font-mono">{q?.price?.toFixed(2) ?? "—"}</div>
                      <div className={`text-sm font-mono ${chg >= 0 ? "text-bull" : "text-bear"}`}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}