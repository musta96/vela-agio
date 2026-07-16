import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sigma } from "lucide-react";
import { computeFibonacci } from "@/lib/ta/fib";
import type { Bar } from "@/lib/ta/types";

interface Props { bars: Bar[]; }

export function FibonacciCard({ bars }: Props) {
  const fib = useMemo(() => computeFibonacci(bars), [bars]);
  if (!fib) return null;
  const biasBg =
    fib.bias === "bullish" ? "border-success/40 bg-success/10 text-success" :
    fib.bias === "bearish" ? "border-destructive/40 bg-destructive/10 text-destructive" :
    "border-border bg-muted/40 text-muted-foreground";

  return (
    <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sigma className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Fibonacci levels</h3>
        </div>
        <Badge variant="outline" className={`uppercase ${biasBg}`}>{fib.bias}</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Last impulse: {fib.direction === "up" ? "↑" : "↓"} from {fib.from.price.toFixed(2)} ({new Date(fib.from.t).toLocaleDateString()}) to {fib.to.price.toFixed(2)} ({new Date(fib.to.t).toLocaleDateString()}).
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {fib.levels.map((l, i) => (
          <div key={i} className={`p-2 rounded border text-center ${l.inGoldenZone ? "border-warning/50 bg-warning/10" : "border-border"} ${fib.atLevel === l ? "ring-2 ring-primary" : ""}`}>
            <p className="text-[10px] uppercase text-muted-foreground">{l.kind} {l.label}</p>
            <p className="font-semibold text-sm">{l.price.toFixed(2)}</p>
            {l.inGoldenZone && <p className="text-[10px] text-warning-foreground">golden</p>}
          </div>
        ))}
      </div>
      {fib.atLevel && (
        <p className="mt-3 text-xs p-2 rounded border border-primary/30 bg-primary/5">
          Price is currently reacting near the <span className="font-semibold">{fib.atLevel.label} {fib.atLevel.kind}</span> level ({fib.atLevel.price.toFixed(2)}). Watch for candlestick confirmation before committing to the trade.
        </p>
      )}
    </Card>
  );
}