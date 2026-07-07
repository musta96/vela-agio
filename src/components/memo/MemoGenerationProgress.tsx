import { CheckCircle2, Loader2, RotateCw, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export type MemoTickerStatus = "queued" | "fetching" | "retrying" | "done" | "failed" | "cached";

export interface MemoTickerProgress {
  symbol: string;
  status: MemoTickerStatus;
  attempt?: number;
  error?: string;
}

export interface MemoGenerationProgressProps {
  rows: MemoTickerProgress[];
  onRetry?: (symbol: string) => void;
}

function StatusIcon({ s }: { s: MemoTickerStatus }) {
  if (s === "done" || s === "cached")
    return <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-label="done" />;
  if (s === "failed") return <XCircle className="h-3.5 w-3.5 text-destructive" aria-label="failed" />;
  if (s === "queued") return <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-label="queued" />;
  return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-label={s} />;
}

function StatusText({ r }: { r: MemoTickerProgress }) {
  switch (r.status) {
    case "queued": return <span className="text-muted-foreground">Queued</span>;
    case "fetching": return <span>Fetching{r.attempt ? ` · attempt ${r.attempt + 1}` : ""}…</span>;
    case "retrying": return <span className="text-warning">Retrying · attempt {(r.attempt ?? 0) + 1}…</span>;
    case "cached": return <span className="text-muted-foreground">Cached</span>;
    case "done": return <span className="text-success">Done</span>;
    case "failed": return <span className="text-destructive" title={r.error}>Failed{r.error ? ` · ${r.error.slice(0, 60)}` : ""}</span>;
  }
}

export function MemoGenerationProgress({ rows, onRetry }: MemoGenerationProgressProps) {
  if (!rows.length) return null;
  const done = rows.filter((r) => r.status === "done" || r.status === "cached").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  return (
    <div className="rounded border border-border p-2 space-y-1.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium">Deep-dive progress</span>
        <span className="text-muted-foreground">
          {done}/{rows.length} done{failed ? ` · ${failed} failed` : ""}
        </span>
      </div>
      <div className="max-h-40 overflow-y-auto space-y-1">
        {rows.map((r) => (
          <div key={r.symbol} className="flex items-center gap-2 py-0.5">
            <StatusIcon s={r.status} />
            <span className="font-mono w-24 truncate">{r.symbol}</span>
            <span className="flex-1"><StatusText r={r} /></span>
            {r.status === "failed" && onRetry && (
              <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => onRetry(r.symbol)} aria-label={`Retry ${r.symbol}`}>
                <RotateCw className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}