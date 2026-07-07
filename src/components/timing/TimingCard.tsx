import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, TrendingDown, Minus, CalendarClock, ExternalLink, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fetchTimingSignals } from "@/lib/timing/client";
import type { TimingResult } from "@/lib/timing/schema";

interface Props { symbol: string; }

const LOOKAHEAD_OPTIONS = [7, 30, 90] as const;
type Lookahead = (typeof LOOKAHEAD_OPTIONS)[number];
const LOOKAHEAD_STORAGE_KEY = "timing.lookaheadDays";

function readStoredLookahead(): Lookahead {
  if (typeof window === "undefined") return 30;
  const raw = Number(window.localStorage.getItem(LOOKAHEAD_STORAGE_KEY));
  return (LOOKAHEAD_OPTIONS as readonly number[]).includes(raw) ? (raw as Lookahead) : 30;
}

const verdictStyle: Record<TimingResult["verdict"], { bg: string; text: string; label: string; Icon: typeof TrendingUp }> = {
  buy:   { bg: "bg-success/10 border-success/30",     text: "text-success",     label: "Entry window open",  Icon: TrendingUp },
  avoid: { bg: "bg-destructive/10 border-destructive/30", text: "text-destructive", label: "Unfavourable entry", Icon: TrendingDown },
  wait:  { bg: "bg-muted/30 border-border",           text: "text-muted-foreground", label: "Wait for better setup", Icon: Minus },
};

export function TimingCard({ symbol }: Props) {
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: TimingResult }>({ loading: true });
  const [lookahead, setLookahead] = useState<Lookahead>(() => readStoredLookahead());

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true });
    fetchTimingSignals(symbol, { lookaheadDays: lookahead })
      .then((data) => { if (!cancelled) setState({ loading: false, data }); })
      .catch((err: unknown) => { if (!cancelled) setState({ loading: false, error: err instanceof Error ? err.message : String(err) }); });
    return () => { cancelled = true; };
  }, [symbol, lookahead]);

  function handleLookaheadChange(v: string) {
    const n = Number(v);
    if (!(LOOKAHEAD_OPTIONS as readonly number[]).includes(n)) return;
    const next = n as Lookahead;
    setLookahead(next);
    if (typeof window !== "undefined") window.localStorage.setItem(LOOKAHEAD_STORAGE_KEY, String(next));
  }

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
  // Top drivers = highest signed contributions to the composite score.
  const topDrivers = useMemo(() => {
    return d.signals
      .map((s) => ({
        ...s,
        contribution: s.direction === "buy" ? s.weight : s.direction === "avoid" ? -s.weight : 0,
      }))
      .filter((s) => s.contribution !== 0)
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 3);
  }, [d.signals]);

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

      {topDrivers.length > 0 && (
        <div className="mt-3 rounded-md border border-border bg-background/40 p-2.5">
          <p className="text-[11px] font-medium uppercase text-muted-foreground mb-1.5">Top drivers</p>
          <div className="flex flex-wrap gap-1.5">
            {topDrivers.map((s) => {
              const positive = s.contribution > 0;
              const cls = positive
                ? "border-success/40 text-success bg-success/5"
                : "border-destructive/40 text-destructive bg-destructive/5";
              return (
                <Badge key={s.key} variant="outline" className={`font-normal text-[11px] ${cls}`}>
                  <span className="font-mono mr-1">{positive ? "+" : "−"}{Math.abs(s.contribution)}</span>
                  {s.label}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" /> Upcoming catalysts (next {lookahead}d)
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Lookahead</span>
          <ToggleGroup
            type="single"
            size="sm"
            value={String(lookahead)}
            onValueChange={(v) => v && handleLookaheadChange(v)}
            aria-label="Catalyst lookahead window"
          >
            {LOOKAHEAD_OPTIONS.map((n) => (
              <ToggleGroupItem key={n} value={String(n)} className="h-7 px-2 text-[11px]">{n}d</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>
      {events.length > 0 && (
        <TooltipProvider delayDuration={150}>
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {events.map((e, i) => {
              const confCls = e.confidence === "confirmed"
                ? "border-success/40 text-success"
                : e.confidence === "estimated"
                  ? "border-warning/40 text-warning"
                  : "border-border text-muted-foreground";
              return (
                <li key={i} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                  <span className="font-mono text-muted-foreground w-20 shrink-0">{e.date}</span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5 flex-wrap">
                      {e.sourceUrl ? (
                        <a
                          href={e.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 hover:text-foreground inline-flex items-center gap-0.5"
                          title={e.sourceLabel ?? "Source"}
                        >
                          {e.label}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span>{e.label}</span>
                      )}
                      {e.confidence && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className={`text-[10px] font-normal cursor-help ${confCls}`}>
                              <Info className="h-2.5 w-2.5 mr-1" />{e.confidence}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs">
                            {e.confidenceNote ?? `Confidence: ${e.confidence}.`}
                            {e.sourceLabel && <div className="mt-1 text-muted-foreground">Source: {e.sourceLabel}</div>}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                    {e.note && <span className="block text-[10px] text-muted-foreground mt-0.5">{e.note}</span>}
                  </span>
                  <Badge variant="outline" className="text-[10px] shrink-0">in {e.daysUntil}d</Badge>
                </li>
              );
            })}
          </ul>
        </TooltipProvider>
      )}
      {events.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground italic">No scheduled catalysts within the next {lookahead} days.</p>
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