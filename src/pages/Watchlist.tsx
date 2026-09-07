import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Star, RefreshCw, BellRing, Bell, Plus, Eye, MoreHorizontal, Trash2 } from "lucide-react";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { MiniSparkline, ChangePill } from "@/components/ui/mini-sparkline";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useToast } from "@/hooks/use-toast";
import { useMemo, useState } from "react";
import { AlertSettingsDialog } from "@/components/AlertSettingsDialog";
import { useAlerts } from "@/hooks/useAlerts";
import { useAlertMonitor } from "@/hooks/useAlertMonitor";
import { TickerSearch } from "@/components/TickerSearch";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { LimitReachedCTA } from "@/components/gating/LimitReachedCTA";
import { ProgressiveHint } from "@/components/onboarding/ProgressiveHint";
import { useWatchlistInsights } from "@/hooks/useWatchlistInsights";
import { classifyInstrument, detailPathFor, INSTRUMENT_BADGE, INSTRUMENT_LABEL } from "@/lib/instrumentType";
import { Sparkline } from "@/components/watchlist/Sparkline";

const Watchlist = () => {
  const { items, remove, add, isWatched } = useWatchlist();
  const { toast } = useToast();
  const symbols = useMemo(() => items.map((i) => i.symbol), [items]);
  const { quotes, loading, lastUpdated, refresh } = useLiveQuotes(symbols, 30000);
  const { rules, history, clearHistory } = useAlerts();
  const { insights, history: snapshots } = useWatchlistInsights(items, quotes);
  useAlertMonitor();
  const [filter, setFilter] = useState("");
  const limits = usePlanLimits();
  const watchlistCap = limits.maxWatchlist;
  const atCap = watchlistCap != null && items.length >= watchlistCap;

  const handleRemove = (symbol: string, name: string) => {
    remove(symbol);
    toast({ title: "Removed from watchlist", description: `${symbol} - ${name}` });
  };

  const handleAdd = (hit: { symbol: string; name: string; type?: string }) => {
    if (isWatched(hit.symbol)) {
      toast({ title: "Already on watchlist", description: `${hit.symbol} — ${hit.name}` });
      return;
    }
    if (atCap) {
      toast({
        title: `You've hit your free watchlist limit (${watchlistCap})`,
        description: "Upgrade to Pro to track unlimited tickers.",
        variant: "destructive",
      });
      return;
    }
    add(hit.symbol, hit.name, hit.type ?? null);
    toast({ title: "Added to watchlist", description: `${hit.symbol} — ${hit.name}` });
  };

  const armed = rules.filter((r) => r.enabled).length;
  const visible = items.filter((i) =>
    !filter.trim() || i.symbol.toLowerCase().includes(filter.toLowerCase()) || i.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-8 space-y-6 min-w-0">
      <SEO title="Watchlist - Live Quotes & Price Alerts for Your Stocks" description="Monitor your favorite FTSE MIB, EU, and US stocks with live quotes, custom alerts, and one-click access to deep analysis." path="/watchlist" />
      <PageHeader
        icon={Eye}
        title="Watchlist"
        description={`${items.length} instrument${items.length === 1 ? "" : "s"} tracked · ${armed} alert${armed === 1 ? "" : "s"} armed · ${history.length} firing right now`}
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-2">
              <Bell className="h-4 w-4" /> Manage alerts
            </Button>
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </>
        }
      />

      <ProgressiveHint
        hintKey="watchlist-to-portfolio"
        when={items.length >= 1 && items.length <= 5}
        title="Own some of these? Turn them into a portfolio."
        body="See live P/L, sector exposure and Vela signals against real positions."
        cta={{ to: "/portfolio", label: "Open Portfolio" }}
      />

      <div className="rounded-2xl border border-border bg-card px-5 py-4">
        <div className="flex items-center gap-2 mb-2 text-sm font-medium">
          <Plus className="h-4 w-4 text-primary" /> Add to watchlist
          {watchlistCap != null && (
            <span className="ml-auto text-xs text-muted-foreground">
              {items.length} / {watchlistCap} on Free
            </span>
          )}
        </div>
        {atCap ? (
          <LimitReachedCTA
            title={`Watchlist full (${watchlistCap} on Free)`}
            description="Upgrade to Pro to add unlimited tickers, sectors and ETFs to your watchlist."
            source="watchlist_cap"
          />
        ) : (
          <TickerSearch
            onSelect={handleAdd}
            placeholder="Search any company, ETF, index, crypto on any exchange…"
            clearOnSelect
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Main list */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 flex flex-wrap items-center gap-2 border-b border-border">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter ticker, sector, country…"
              className="h-9 max-w-xs bg-background"
            />
            <span className="ml-auto text-xs text-muted-foreground">{visible.length} shown</span>
          </div>

          {visible.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <Star className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="font-semibold mb-1">Nothing on your watchlist yet</p>
              <p className="text-sm text-muted-foreground mb-4">Add stocks, ETFs or funds above and track their price, rating and Vela score here.</p>
              <Button asChild size="sm"><Link to="/dashboard">Browse stocks</Link></Button>
            </div>
          ) : (
            <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <ul className="divide-y divide-border min-w-[680px]">
              {visible.map((item) => {
                const q = quotes[item.symbol];
                const change = q?.change ?? 0;
                const rule = rules.find((r) => r.symbol === item.symbol);
                const alertCount = rule?.enabled
                  ? [rule.priceAbove, rule.priceBelow, rule.changeUpPct, rule.changeDownPct, rule.sentimentAbove, rule.sentimentBelow].filter((v) => v != null).length
                  : 0;
                const trend: "up" | "down" | "flat" = change > 0.05 ? "up" : change < -0.05 ? "down" : "flat";
                const kind = classifyInstrument(item.type ?? q?.quoteType, item.symbol, item.name);
                const ins = insights[item.symbol];
                const points = snapshots[item.symbol] ?? [];
                const currency = q?.currency === "USD" ? "$" : q?.currency === "GBP" ? "£" : "€";
                return (
                  <li key={item.symbol} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto_auto] items-center gap-4 px-5 py-3 hover:bg-muted/40 transition-colors">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    <Link to={detailPathFor(kind, item.symbol)} className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{item.symbol}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${INSTRUMENT_BADGE[kind]}`}>
                          {INSTRUMENT_LABEL[kind]}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{item.name}</div>
                    </Link>
                    <div className="text-right tabular-nums font-semibold text-sm w-24">
                      {q ? `${currency}${q.price.toFixed(2)}` : "-"}
                    </div>
                    <div className="w-16 text-right">
                      {q && <ChangePill pct={change} />}
                    </div>
                    <div className="w-24 text-right text-xs">
                      {ins?.loading ? (
                        <span className="text-muted-foreground">…</span>
                      ) : ins?.velaScore != null ? (
                        <>
                          <div className="font-semibold tabular-nums">{Math.round(ins.velaScore)}<span className="text-muted-foreground">/100</span></div>
                          <div className="text-[11px] text-muted-foreground">Vela {ins.velaGrade ?? ""}{ins.riskLabel ? ` · ${ins.riskLabel} risk` : ""}</div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="w-20 text-right text-xs">
                      {ins?.morningstar != null ? (
                        <>
                          <div className="font-semibold">{"★".repeat(Math.round(ins.morningstar))}</div>
                          <div className="text-[11px] text-muted-foreground">Morningstar</div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                    {points.length >= 2 ? (
                      <Sparkline
                        values={points.map((p) => p.price).filter((v): v is number => v != null)}
                        width={90}
                        height={26}
                        label={`${points.length} days tracked`}
                      />
                    ) : (
                      <MiniSparkline trend={trend} width={90} height={26} />
                    )}
                    <div className="flex items-center gap-1">
                      <span className="sr-only">{alertCount} alerts</span>
                      <AlertSettingsDialog symbol={item.symbol} name={item.name} currentPrice={q?.price} />
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemove(item.symbol, item.name)} aria-label="Remove">
                        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            </div>
          )}
        </div>

        {/* Right rail: Triggered alerts */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Triggered alerts</h2>
              <span className="text-xs rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">{history.length} firing</span>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-6">
                <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <BellRing className="h-6 w-6 text-primary" />
                </div>
                <p className="font-semibold mb-1.5">Nothing firing right now</p>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  Set price, % move, RSI or sentiment conditions on any watched stock - you'll get a toast and a browser notification.
                </p>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Create alert
                </Button>
              </div>
            ) : (
              <ul className="space-y-2 max-h-64 overflow-y-auto">
                {history.slice(0, 12).map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-2 text-xs border border-border rounded-lg p-2">
                    <div className="min-w-0">
                      <div className="font-semibold">{e.symbol}</div>
                      <div className="text-muted-foreground truncate">{e.message}</div>
                    </div>
                    <span className="text-muted-foreground whitespace-nowrap">{new Date(e.at).toLocaleTimeString()}</span>
                  </li>
                ))}
              </ul>
            )}

            {history.length > 0 && (
              <Button variant="ghost" size="sm" className="w-full mt-3 gap-1.5" onClick={clearHistory}>
                <Trash2 className="h-3.5 w-3.5" /> Clear history
              </Button>
            )}
          </div>

          {history.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-semibold text-sm mb-3">Recent alert history</h3>
              <ul className="space-y-2 text-xs">
                {history.slice(0, 5).map((e) => (
                  <li key={`r-${e.id}`} className="flex items-center justify-between gap-2">
                    <span className="truncate"><span className="font-semibold">{e.symbol}</span> · {e.message}</span>
                    <span className="text-muted-foreground">{new Date(e.at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default Watchlist;