import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SPOTLIGHT_SYMBOLS } from "@/data/curatedLists";
import type { LiveQuote } from "@/hooks/useLiveQuotes";
import { currencySign } from "@/data/stockCatalog";

/**
 * Benchmark strip — quiet glass tiles, no emoji. Each tile shows the
 * instrument, its price (when available) and an arrow-tinted change.
 */
export function SpotlightStrip() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.functions.invoke("market-data", {
        body: { action: "quote", symbols: SPOTLIGHT_SYMBOLS.map((s) => s.symbol) },
      });
      if (!cancelled && data?.quotes) setQuotes(data.quotes as Record<string, LiveQuote>);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex gap-3 overflow-x-auto snap-x pb-1 -mx-1 px-1 scrollbar-hide">
      {SPOTLIGHT_SYMBOLS.map(({ symbol, label, Icon }) => {
        const q = quotes[symbol];
        const ch = q?.change;
        const positive = (ch ?? 0) >= 0;
        const color = ch == null ? "text-muted-foreground" : positive ? "text-emerald-500" : "text-red-500";
        const Arrow = positive ? ArrowUpRight : ArrowDownRight;
        return (
          <button
            key={symbol}
            onClick={() => navigate(`/stock/${encodeURIComponent(symbol)}`)}
            className="snap-start shrink-0 group glass-card rounded-2xl px-4 py-3 min-w-[180px] text-left transition-all hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Icon className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="text-[11px] uppercase tracking-[0.14em]">{label}</span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="text-base font-semibold tabular-nums">
                {q ? `${currencySign(q.currency)}${q.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
              </span>
              <span className={`inline-flex items-center gap-0.5 text-xs tabular-nums ${color}`}>
                {ch != null && <Arrow className="h-3 w-3" strokeWidth={2.5} />}
                {ch == null ? "—" : `${Math.abs(ch).toFixed(2)}%`}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}