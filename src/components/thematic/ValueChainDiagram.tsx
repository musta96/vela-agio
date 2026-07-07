import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import type { ThematicResult } from "@/lib/thematic/schema";
import { SEGMENT_LABELS } from "@/lib/thematic/schema";

interface Props { chain: ThematicResult["chain"]; }

const exposureStyle: Record<string, string> = {
  "pure-play": "border-success/40 text-success",
  partial: "border-primary/40 text-primary",
  adjacent: "border-border text-muted-foreground",
};

export function ValueChainDiagram({ chain }: Props) {
  return (
    <div className="grid gap-3 md:grid-cols-5">
      {chain.map((seg) => (
        <Card key={seg.segment} className="p-3 card-gradient border-border">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            {SEGMENT_LABELS[seg.segment] ?? seg.label}
          </p>
          <ul className="space-y-1.5">
            {seg.companies.map((c) => (
              <li key={c.symbol} className="flex items-center justify-between gap-2">
                <Link to={`/stock/${encodeURIComponent(c.symbol)}`} className="text-xs font-mono font-semibold hover:underline truncate">
                  {c.symbol}
                </Link>
                <Badge variant="outline" className={`text-[9px] shrink-0 ${exposureStyle[c.exposure] ?? ""}`}>
                  {c.exposure}
                </Badge>
              </li>
            ))}
            {seg.companies.length === 0 && (
              <li className="text-xs text-muted-foreground italic">No names identified.</li>
            )}
          </ul>
        </Card>
      ))}
    </div>
  );
}

export default ValueChainDiagram;