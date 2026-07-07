import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Shield } from "lucide-react";
import { suggestHedges } from "@/lib/shorts";
import { useToast } from "@/hooks/use-toast";

export function HedgeSuggestions({
  symbol,
  qty,
  entryPrice,
  lastPrice,
}: {
  symbol: string;
  qty: number;
  entryPrice: number;
  lastPrice: number;
}) {
  const suggestions = useMemo(() => suggestHedges(symbol, qty, entryPrice, lastPrice), [symbol, qty, entryPrice, lastPrice]);
  const [copied, setCopied] = useState<string | null>(null);
  const { toast } = useToast();

  async function copyAll(id: string, combined: string) {
    try {
      await navigator.clipboard.writeText(combined);
      setCopied(id);
      toast({ title: "Copied paper-order instructions", description: combined });
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Shield className="h-3 w-3" /> Quick hedge suggestions
      </div>
      {suggestions.map((s) => {
        const combined = s.legs.map((l) => {
          if (l.kind === "stock") return `${l.action.toUpperCase()} ${l.qty} ${l.symbol}${l.note ? ` (${l.note})` : ""}`;
          return `${l.action.toUpperCase()} ${l.qty} ${l.symbol} ${l.kind.toUpperCase()} @ strike ${l.strike}`;
        }).join("; ");
        return (
          <div key={s.id} className="rounded-md border border-border/60 p-2.5 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold text-xs">{s.title}</div>
              <Button size="sm" variant="ghost" className="h-6 px-2 gap-1" onClick={() => copyAll(s.id, combined)}>
                {copied === s.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                <span className="text-[10px]">Copy</span>
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">{s.rationale}</p>
            <div className="flex flex-wrap gap-1">
              {s.legs.map((l, i) => (
                <Badge key={i} variant="outline" className="text-[10px] font-mono">
                  {l.action.toUpperCase()} {l.qty} {l.symbol}{l.kind !== "stock" ? ` ${l.kind.toUpperCase()} ${l.strike}` : ""}
                </Badge>
              ))}
            </div>
            <code className="block text-[10px] bg-muted/50 rounded px-2 py-1 font-mono text-muted-foreground truncate">{combined}</code>
          </div>
        );
      })}
      <p className="text-[10px] text-muted-foreground">
        Educational suggestions only. Copy to clipboard and enter manually in the paper-trading ticket.
      </p>
    </div>
  );
}