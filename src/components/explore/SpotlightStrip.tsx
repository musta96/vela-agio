import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SPOTLIGHT_SYMBOLS } from "@/data/curatedLists";
import type { LiveQuote } from "@/hooks/useLiveQuotes";

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
    <div className="flex gap-3 overflow-x-auto snap-x pb-2 -mx-1 px-1 scrollbar-hide">
      {SPOTLIGHT_SYMBOLS.map((item) => {
        const q = quotes[item.symbol];
        const ch = q?.change;
        const positive = (ch ?? 0) >= 0;
        const color = ch == null ? "text-muted-foreground" : positive ? "text-emerald-500" : "text-red-500";
        const arrow = ch == null ? "" : positive ? "↗" : "↘";
        return (
          <button
            key={item.symbol}
            onClick={() => navigate(`/stock/${encodeURIComponent(item.symbol)}`)}
            className="snap-start shrink-0 flex items-center gap-2 px-3 py-2 rounded-full glass-card text-sm whitespace-nowrap"
          >
            <span className="text-base leading-none">{item.emoji}</span>
            <span className="font-medium">{item.label}</span>
            <span className={`tabular-nums text-xs ${color}`}>
              {ch == null ? "—" : `${arrow} ${Math.abs(ch).toFixed(2)}%`}
            </span>
          </button>
        );
      })}
    </div>
  );
}