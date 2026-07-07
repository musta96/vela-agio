import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, TrendingDown, Minus, CalendarClock } from "lucide-react";
import { fetchTimingSignals } from "@/lib/timing/client";
import type { TimingResult } from "@/lib/timing/schema";

interface Props { symbol: string; }

const verdictStyle: Record<TimingResult["verdict"], { bg: string; text: string; label: string; Icon: typeof TrendingUp }> = {
  buy:   { bg: "bg-success/10 border-success/30",     text: "text-success",     label: "Entry window open",  Icon: TrendingUp },
  avoid: { bg: "bg-destructive/10 border-destructive/30", text: "text-destructive", label: "Unfavourable entry", Icon: TrendingDown },
  wait:  { bg: "bg-muted/30 border-border",           text: "text-muted-foreground", label: "Wait for better setup", Icon: Minus },
};

export function TimingCard({ symbol }: Props) {
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: TimingResult }>({ loading: true });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true });
    fetchTimingSignals(symbol)
      .then((data) => { if (!cancelled) setState({ loading: false, data }); })
      .catch((err: unknown) => { if (!cancelled) setState({ loading: false, error: err instanceof Error ? err.message : String(err) }); });
    return () => { cancelled = true; };
  }, [symbol]);

  if (state.loading) {
    return (
      <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Scoring entry timing for {symbol}…
        </div>
      </Card>
    );
  }
  if (state.error || !state.data) {
    return (
      <Card className="p-4 sm:p-6 mb-6 card-gradient border-destructive/40">
        <p className="text-sm text-destructive">Entry timing unavailable: {state.error ?? "no data"}</p>
      </Card>
    );
  }

  const d = state.data;
  const v = verdictStyle[d.verdict];
  const families: Array<{ key: TimingResult["signals"][number]["family"]; title: string }> = [
    { key: "tech", title: "Technicals (RSI / MACD / DMA)" },
    { key: "fund", title: "Fundamentals" },
    { key: "macro", title: "Macro & event proximity" },
  ];
  const events = useMemo(
    () => (d.events ?? []).slice().sort((a, b) => a.daysUntil - b.daysUntil),
    [d.events],
  );
  const drill = useMemo(
    () => d.signals.slice().sort((a, b) => b.weight - a.weight),
    [d.signals],
  );

  return (
    <Card className={`p-4 sm:p-6 mb-6 border ${v.bg}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <v.Icon className={`h-5 w-5 ${v.text}`} />
          <div>
            <p className="text-sm text-muted-foreground">Entry timing</p>
            <p className={`text-xl font-bold ${v.text}`}>{v.label}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Composite</p>
          <p className="text-2xl font-bold">{d.score > 0 ? "+" : ""}{d.score}</p>
          <p className="text-[11px] text-muted-foreground">{new Date(d.asOf).toLocaleString()}</p>
        </div>
      </div>
      <p className="mt-3 text-sm">{d.headline}</p>

      {events.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" /> Upcoming catalysts (next 30d)
          </p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {events.map((e, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                <span className="font-mono text-muted-foreground w-16 shrink-0">{e.date}</span>
                <span className="flex-1">{e.label}{e.note ? <span className="block text-[10px] text-muted-foreground">{e.note}</span> : null}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">in {e.daysUntil}d</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs font-medium uppercase text-muted-foreground mb-1.5">Why this verdict — triggers that fired</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {families.map(({ key, title }) => {
            const items = drill.filter((s) => s.family === key);
            if (!items.length) return null;
            return (
              <div key={key} className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">{title}</p>
                <ul className="space-y-1">
                  {items.map((s) => {
                    const contrib = s.direction === "buy" ? `+${s.weight}` : s.direction === "avoid" ? `−${s.weight}` : `0`;
                    const cls = s.direction === "buy" ? "border-success/40 text-success" : s.direction === "avoid" ? "border-destructive/40 text-destructive" : "";
                    return (
                      <li key={s.key} className="flex items-start justify-between gap-2 text-[11px]">
                        <span className="flex-1">{s.label}{s.note ? <span className="block text-[10px] text-muted-foreground">{s.note}</span> : null}</span>
                        <Badge variant="outline" className={`shrink-0 font-mono text-[10px] ${cls}`}>{contrib}</Badge>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {d.sources.length > 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Sources: {d.sources.map((s, i) => (s.url ? <a key={i} href={s.url} className="underline mr-2" target="_blank" rel="noreferrer">{s.label}</a> : <span key={i} className="mr-2">{s.label}</span>))}
        </p>
      )}
    </Card>
  );
}

export default TimingCard;