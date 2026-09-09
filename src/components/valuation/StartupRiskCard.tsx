import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldAlert, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { assessStartupPortfolio, type RiskInputs } from "@/lib/startupRisk";

interface Props {
  rows: RiskInputs[];
  /** Formats money in the portfolio's base currency. */
  money: (n: number) => string;
}

const bandTone: Record<string, string> = {
  Low: "text-emerald-500",
  Moderate: "text-foreground",
  High: "text-amber-500",
  "Very high": "text-destructive",
};

/** Risk and expected return of a private book, driven by method, press and stage. */
export function StartupRiskCard({ rows, money }: Props) {
  const [sentiment, setSentiment] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(false);
  const done = useRef<Set<string>>(new Set());

  // Read live press sentiment for the largest holdings; the model works without it.
  useEffect(() => {
    const targets = [...rows].sort((a, b) => b.value - a.value).slice(0, 8).filter((r) => !done.current.has(r.id));
    if (targets.length === 0) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      for (const r of targets) {
        done.current.add(r.id);
        const { data } = await supabase.functions.invoke("startup-sentiment", { body: { name: r.name } });
        if (cancelled) return;
        const score = typeof (data as any)?.score === "number" ? (data as any).score : null;
        setSentiment((s) => ({ ...s, [r.id]: score }));
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; setLoading(false); };
  }, [rows]);

  const model = useMemo(
    () => assessStartupPortfolio(rows.map((r) => ({ ...r, sentiment: sentiment[r.id] ?? null }))),
    [rows, sentiment],
  );

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4" />Risk &amp; expected return</CardTitle>
        {loading && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />reading press…</span>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Portfolio risk</p>
            <p className={`text-xl font-semibold ${bandTone[model.band]}`}>{model.risk}/100</p>
            <p className="text-xs text-muted-foreground">{model.band}</p>
            <Progress value={model.risk} className="h-1.5 mt-2" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Expected multiple</p>
            <p className="text-xl font-semibold">{model.expectedMultiple.toFixed(2)}x</p>
            <p className="text-xs text-muted-foreground">on today's mark</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Expected value</p>
            <p className="text-xl font-semibold">{money(model.expectedValue)}</p>
            <p className="text-xs text-muted-foreground">odds-weighted</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Value at real risk</p>
            <p className="text-xl font-semibold">{money(model.lossValue)}</p>
            <p className="text-xs text-muted-foreground">holdings under 40% survival odds</p>
          </div>
        </div>

        <ul className="space-y-1 text-xs text-muted-foreground list-disc pl-4">
          {model.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead className="text-right">Stage risk</TableHead>
                <TableHead className="text-right">Method risk</TableHead>
                <TableHead className="text-right">Press</TableHead>
                <TableHead className="text-right">Risk</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead>Main driver</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...model.holdings].sort((a, b) => b.weight - a.weight).map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">{h.name}</TableCell>
                  <TableCell className="text-right text-sm">{(h.weight * 100).toFixed(1)}%</TableCell>
                  <TableCell className="text-right text-sm">{Math.round(h.stageRisk)}</TableCell>
                  <TableCell className="text-right text-sm">{Math.round(h.methodRisk)}</TableCell>
                  <TableCell className="text-right text-sm">{h.sentiment == null ? "—" : h.sentiment.toFixed(0)}</TableCell>
                  <TableCell className="text-right text-sm">
                    <Badge variant={h.risk >= 80 ? "destructive" : h.risk >= 65 ? "secondary" : "outline"}>{Math.round(h.risk)}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm">{h.expectedMultiple.toFixed(2)}x</TableCell>
                  <TableCell className="text-xs text-muted-foreground capitalize">{h.driver}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Risk blends how early each company is (38%), how solid the valuation behind the mark is (27%),
          what the press is saying (20%) and how big the position is (15%). Expected multiple applies
          survival odds to a stage-typical upside. Estimates, not promises.
        </p>
      </CardContent>
    </Card>
  );
}
