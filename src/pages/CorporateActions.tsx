import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GitBranch } from "lucide-react";

interface Action { date: string; type: "DIVIDEND" | "SPLIT"; amount?: number; ratio?: string }

export default function CorporateActions() {
  const [symbol, setSymbol] = useState("AAPL");
  const [input, setInput] = useState("AAPL");
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=10y&events=div,splits`;
    fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`)
      .then(r => r.json())
      .then(j => {
        const events = j?.chart?.result?.[0]?.events ?? {};
        const list: Action[] = [];
        Object.values<any>(events.dividends ?? {}).forEach(d => list.push({ date: new Date(d.date * 1000).toISOString().slice(0,10), type: "DIVIDEND", amount: d.amount }));
        Object.values<any>(events.splits ?? {}).forEach(s => list.push({ date: new Date(s.date * 1000).toISOString().slice(0,10), type: "SPLIT", ratio: `${s.numerator}:${s.denominator}` }));
        list.sort((a, b) => b.date.localeCompare(a.date));
        if (!cancelled) setActions(list);
      })
      .catch(() => !cancelled && setErr("Failed to load corporate actions"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [symbol]);

  const totalDiv = actions.filter(a => a.type === "DIVIDEND").reduce((s, a) => s + (a.amount ?? 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Corporate Actions | Vela.ai" description="Splits, dividends, adjusted price reconstruction" path="/corporate-actions" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3"><GitBranch className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">Corporate Actions</h1></div>
        <div className="flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} className="max-w-xs" />
          <Button onClick={() => setSymbol(input.trim())}>Load</Button>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">10Y Dividends</CardTitle></CardHeader><CardContent className="text-2xl font-mono">${totalDiv.toFixed(2)}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Splits</CardTitle></CardHeader><CardContent className="text-2xl font-mono">{actions.filter(a => a.type === "SPLIT").length}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Events</CardTitle></CardHeader><CardContent className="text-2xl font-mono">{actions.length}</CardContent></Card>
        </div>
        <Card>
          <CardHeader><CardTitle>Event Log (10-year)</CardTitle></CardHeader>
          <CardContent>
            {loading && <div className="text-muted-foreground">Loading…</div>}
            {err && <div className="text-bear">{err}</div>}
            <div className="divide-y">
              {actions.map((a, i) => (
                <div key={i} className="py-2 grid grid-cols-3 text-sm">
                  <div className="font-mono">{a.date}</div>
                  <div>{a.type}</div>
                  <div className="font-mono text-right">{a.type === "DIVIDEND" ? `$${a.amount?.toFixed(4)}` : a.ratio}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">Yahoo bars in OHLC views are already split- and dividend-adjusted. The raw events above let you reconstruct unadjusted history if needed.</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}