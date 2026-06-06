import { Badge } from "@/components/ui/badge";
import { Database, AlertTriangle } from "lucide-react";

const LABEL: Record<string, string> = {
  yahoo: "Yahoo Finance",
  fred: "FRED (St. Louis Fed)",
  ecb_sdw: "ECB SDW",
  eurostat: "Eurostat",
  fmp: "Financial Modeling Prep",
  alpha_vantage: "Alpha Vantage",
  cache: "Cached",
};

function timeAgo(ts?: number): string {
  if (!ts) return "—";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function DataSourceBadge({
  source,
  asOf,
  stale,
  notCovered,
  className,
}: {
  source?: string;
  asOf?: number;
  stale?: boolean;
  notCovered?: boolean;
  className?: string;
}) {
  if (notCovered) {
    return (
      <Badge variant="outline" className={`gap-1 text-[10px] ${className ?? ""}`}>
        <AlertTriangle className="h-3 w-3" /> Not covered
      </Badge>
    );
  }
  const label = source ? (LABEL[source] ?? source) : "Unknown source";
  return (
    <Badge
      variant={stale ? "secondary" : "outline"}
      className={`gap-1 text-[10px] font-normal ${className ?? ""}`}
      title={`Source: ${label}${asOf ? ` · as of ${new Date(asOf).toLocaleString()}` : ""}`}
    >
      <Database className="h-3 w-3" />
      {label}
      <span className="text-muted-foreground">· {timeAgo(asOf)}{stale ? " · stale" : ""}</span>
    </Badge>
  );
}