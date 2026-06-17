import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { InstrumentCard } from "./InstrumentCard";
import type { CuratedRail, RailGroup as RailGroupType } from "@/data/curatedLists";
import type { LiveQuote } from "@/hooks/useLiveQuotes";

interface Props { group: RailGroupType }

/** A titled section with sub-tabs and a horizontal rail of instrument cards. */
export function RailGroup({ group }: Props) {
  const [active, setActive] = useState(group.rails[0]?.id);
  const rail = group.rails.find((r) => r.id === active) ?? group.rails[0];

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{group.eyebrow}</div>
          <h2 className="text-lg font-semibold leading-tight">{group.title}</h2>
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {group.rails.map((r) => {
            const isActive = r.id === active;
            const Icon = r.Icon;
            return (
              <button
                key={r.id}
                onClick={() => setActive(r.id)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors border ${
                  isActive
                    ? "border-transparent bg-foreground text-background"
                    : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                <span>{r.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      {rail && <Rail rail={rail} />}
    </section>
  );
}

function Rail({ rail }: { rail: CuratedRail }) {
  const { user } = useAuth();
  const [symbols, setSymbols] = useState<string[]>(rail.kind === "symbols" ? (rail.symbols ?? []) : []);
  const [names, setNames] = useState<Record<string, string>>({});
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setQuotes({});
    (async () => {
      let syms: string[] = [];
      const nameMap: Record<string, string> = {};

      if (rail.kind === "symbols") {
        syms = (rail.symbols ?? []).slice(0, 10);
      } else if (rail.kind === "screener") {
        const { data } = await supabase.functions.invoke("market-movers", {
          body: { scope: "global", screener: rail.screener, region: rail.region ?? "us", limit: 10 },
        });
        const movers = (data?.movers as any[]) ?? [];
        syms = movers.map((m) => m.symbol).filter(Boolean).slice(0, 10);
        for (const m of movers) if (m.symbol && m.name) nameMap[m.symbol] = m.name;
      } else if (rail.kind === "internal") {
        if (!user) { if (!cancelled) { setSymbols([]); setLoading(false); } return; }
        const { data } = await supabase.functions.invoke("popular-instruments", {
          body: { metric: rail.metric, limit: 10 },
        });
        syms = ((data?.items as any[]) ?? []).map((it) => it.symbol).filter(Boolean);
      }

      if (cancelled) return;
      setSymbols(syms);
      setNames(nameMap);
      if (syms.length === 0) { setLoading(false); return; }

      const { data: q } = await supabase.functions.invoke("market-data", {
        body: { action: "quote", symbols: syms },
      });
      if (cancelled) return;
      setQuotes((q?.quotes ?? {}) as Record<string, LiveQuote>);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rail.id, user?.id]);

  if (rail.requiresAuth && !user) {
    return (
      <div className="rounded-2xl glass-card p-6 text-sm text-muted-foreground">
        Sign in to see what investors are {rail.metric === "most_owned" ? "holding" : rail.metric === "most_bought" ? "buying" : "selling"}.
      </div>
    );
  }

  if (!loading && symbols.length === 0) {
    return <div className="rounded-2xl glass-card p-5 text-sm text-muted-foreground">No data right now.</div>;
  }

  return (
    <div className="flex gap-3 overflow-x-auto snap-x pb-2 scrollbar-hide -mx-1 px-1">
      {(loading ? Array.from({ length: 6 }).map((_, i) => `__sk_${i}`) : symbols).map((s) => {
        if (s.startsWith("__sk_")) {
          return <div key={s} className="snap-start shrink-0 w-[152px] h-[152px] rounded-2xl bg-muted/40 animate-pulse" />;
        }
        const q = quotes[s];
        return <InstrumentCard key={s} symbol={s} name={names[s] || s} quote={q} />;
      })}
    </div>
  );
}