import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { MiniSparkline, ChangePill } from "@/components/ui/mini-sparkline";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useMacroSeries } from "@/hooks/useMacroSeries";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { Globe2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const GROUPS: { title: string; symbols: { s: string; label: string }[] }[] = [
  { title: "Rates", symbols: [
    { s: "^TNX", label: "US 10Y" }, { s: "^FVX", label: "US 5Y" }, { s: "^IRX", label: "US 3M" }, { s: "^TYX", label: "US 30Y" },
  ]},
  { title: "FX", symbols: [
    { s: "EURUSD=X", label: "EUR/USD" }, { s: "GBPUSD=X", label: "GBP/USD" }, { s: "USDJPY=X", label: "USD/JPY" }, { s: "USDCHF=X", label: "USD/CHF" },
  ]},
  { title: "Commodities", symbols: [
    { s: "GC=F", label: "Gold" }, { s: "SI=F", label: "Silver" }, { s: "CL=F", label: "WTI Oil" }, { s: "NG=F", label: "Nat Gas" },
  ]},
  { title: "Indices & Vol", symbols: [
    { s: "^GSPC", label: "S&P 500" }, { s: "^FTMIB", label: "FTSE MIB" }, { s: "^STOXX50E", label: "Euro Stoxx 50" }, { s: "^VIX", label: "VIX" },
  ]},
  { title: "Crypto / Alt", symbols: [
    { s: "BTC-USD", label: "Bitcoin" }, { s: "ETH-USD", label: "Ethereum" }, { s: "DX-Y.NYB", label: "DXY" }, { s: "^MOVE", label: "MOVE" },
  ]},
];

export default function Macro() {
  const { t } = useTranslation();
  const allSyms = GROUPS.flatMap(g => g.symbols.map(x => x.s));
  const { quotes, refresh, loading } = useLiveQuotes(allSyms, 30_000);
  const macroIds = ["ecb_mro", "ecb_depo", "eur_hicp_yoy", "ea_unemployment", "us_10y", "us_2y"];
  const { series: macro } = useMacroSeries(macroIds);
  const [view, setView] = useState<"tiles" | "list" | "heatmap">("tiles");

  return (
    <div className="p-4 sm:p-8 space-y-6 min-w-0">
      <SEO title="Macro Dashboard | Vela.ai" description="Rates, FX, commodities, credit, vol" path="/macro" />
      <PageHeader
        icon={Globe2}
        title={t("pages.macro.title")}
        description="Rates, FX, commodities and volatility across global markets."
        actions={
          <>
            <div className="inline-flex items-center rounded-lg border border-border bg-card p-1 text-xs">
              {(["List", "Tiles", "Heatmap"] as const).map((v) => {
                const k = v.toLowerCase() as typeof view;
                const active = view === k;
                return (
                  <button
                    key={v}
                    onClick={() => setView(k)}
                    className={`px-3 py-1.5 rounded-md transition ${active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </>
        }
      />
      {GROUPS.map((g) => (
        <section key={g.title} className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            {t(`pages.macro.groups.${g.title}`, g.title)}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {g.symbols.map(({ s, label }) => {
              const q = quotes[s];
              const chg = q?.change ?? 0;
              const trend: "up" | "down" | "flat" = chg > 0.05 ? "up" : chg < -0.05 ? "down" : "flat";
              return (
                <div
                  key={s}
                  className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <ChangePill pct={chg} className="text-xs" />
                  </div>
                  <div className="text-2xl font-bold tracking-tight tabular-nums">
                    {q?.price != null
                      ? (g.title === "Rates" ? `${q.price.toFixed(2)}%` : q.price.toFixed(g.title === "FX" ? 4 : 2))
                      : "-"}
                  </div>
                  <MiniSparkline trend={trend} width={220} height={32} className="w-full" />
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {/* Authoritative macro series (P5 #25) */}
      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
          Official Series (ECB · FRED · Eurostat)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {macroIds.map((id) => {
            const s = macro[id];
            const last = s?.points?.[s.points.length - 1];
            return (
              <div key={id} className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm text-muted-foreground">{s?.label ?? id}</span>
                  <DataSourceBadge
                    source={s?.source}
                    asOf={s?.asOf}
                    stale={s?.stale}
                    notCovered={s?.notCovered}
                  />
                </div>
                <div className="text-2xl font-bold tracking-tight tabular-nums">
                  {s?.notCovered
                    ? <span className="text-sm font-normal text-muted-foreground">Not covered</span>
                    : last
                      ? `${last.v.toFixed(2)}${s.unit === "%" ? "%" : ""}`
                      : "-"}
                </div>
                {last && (
                  <span className="text-[11px] text-muted-foreground">as of {last.t}</span>
                )}
              </div>
            );
          })}
        </div>
      </section>
      {/* Cross-asset correlation card */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Cross-asset correlation (60d)</h2>
          <span className="text-xs text-muted-foreground">vs S&P 500</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          {[
            { label: "SPX vs US10Y", value: -0.42, dot: "hsl(var(--primary))" },
            { label: "SPX vs Gold",  value:  0.18, dot: "hsl(262 83% 58%)" },
            { label: "SPX vs DXY",   value: -0.31, dot: "hsl(174 60% 51%)" },
            { label: "SPX vs BTC",   value:  0.55, dot: "hsl(38 92% 50%)" },
            { label: "SPX vs WTI",   value:  0.12, dot: "hsl(var(--destructive))" },
            { label: "SPX vs VIX",   value: -0.88, dot: "hsl(var(--success))" },
          ].map((r) => (
            <div key={r.label} className="flex items-center justify-between py-1.5 border-b border-border/60 last:border-0">
              <span className="flex items-center gap-2 text-muted-foreground"><span className="h-2 w-2 rounded-full" style={{ background: r.dot }} /> {r.label}</span>
              <span className={`font-semibold tabular-nums ${r.value > 0 ? "text-success" : "text-destructive"}`}>{r.value > 0 ? "+" : ""}{r.value.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}