import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { currencySign } from "@/data/stockCatalog";
import type { LiveQuote } from "@/hooks/useLiveQuotes";

interface Props {
  symbol: string;
  name?: string;
  quote?: LiveQuote;
  emoji?: string;
}

/** Square card used in the Trading 212–style rails. */
export function InstrumentCard({ symbol, name, quote, emoji }: Props) {
  const navigate = useNavigate();
  const change = quote?.change;
  const positive = (change ?? 0) >= 0;
  const colorClass = change == null ? "text-muted-foreground" : positive ? "text-emerald-500" : "text-red-500";
  const arrow = change == null ? "" : positive ? "↗" : "↘";
  const initial = (name || symbol).trim().charAt(0).toUpperCase();
  return (
    <button
      type="button"
      onClick={() => navigate(`/stock/${encodeURIComponent(symbol)}`)}
      className="snap-start shrink-0 w-[152px] text-left"
    >
      <Card className="glass-card p-3 h-[152px] flex flex-col justify-between hover:scale-[1.02] transition-transform">
        <div className="w-10 h-10 rounded-lg bg-muted/60 flex items-center justify-center text-base font-semibold">
          {emoji ?? initial}
        </div>
        <div>
          <div className="text-sm font-medium truncate leading-tight">{name || symbol}</div>
          <div className="text-sm tabular-nums mt-1">
            {quote ? `${currencySign(quote.currency)}${quote.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
          </div>
          <div className={`text-xs tabular-nums ${colorClass}`}>
            {change == null ? "—" : `${arrow} ${Math.abs(change).toFixed(2)}%`}
          </div>
        </div>
      </Card>
    </button>
  );
}