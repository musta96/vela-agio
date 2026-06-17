import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { currencySign } from "@/data/stockCatalog";
import type { LiveQuote } from "@/hooks/useLiveQuotes";

interface Props {
  symbol: string;
  name?: string;
  quote?: LiveQuote;
}

/** Compact instrument card for horizontal discovery rails. */
export function InstrumentCard({ symbol, name, quote }: Props) {
  const navigate = useNavigate();
  const change = quote?.change;
  const positive = (change ?? 0) >= 0;
  const colorClass = change == null ? "text-muted-foreground" : positive ? "text-emerald-500" : "text-red-500";
  const Arrow = positive ? ArrowUpRight : ArrowDownRight;
  const initial = (name || symbol).replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "•";

  return (
    <button
      type="button"
      onClick={() => navigate(`/stock/${encodeURIComponent(symbol)}`)}
      className="snap-start shrink-0 w-[168px] text-left group"
    >
      <Card className="glass-card p-4 h-[168px] flex flex-col justify-between rounded-2xl border-border/60 transition-all group-hover:-translate-y-0.5 group-hover:border-border">
        <div className="flex items-start justify-between">
          <div className="gradient-border w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold tracking-tight">
            {initial}
          </div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground tabular-nums">
            {symbol}
          </div>
        </div>
        <div>
          <div className="text-[13px] font-medium truncate leading-tight">{name || symbol}</div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold tabular-nums">
              {quote ? `${currencySign(quote.currency)}${quote.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
            </span>
            <span className={`inline-flex items-center gap-0.5 text-[11px] tabular-nums ${colorClass}`}>
              {change != null && <Arrow className="h-3 w-3" strokeWidth={2.5} />}
              {change == null ? "—" : `${Math.abs(change).toFixed(2)}%`}
            </span>
          </div>
        </div>
      </Card>
    </button>
  );
}