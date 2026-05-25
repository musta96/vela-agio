import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Clock, ChevronRight } from "lucide-react";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useAuth } from "@/hooks/useAuth";
import { AIBriefing } from "@/components/AIBriefing";

const WATCH = [
  { sym: "ISP.MI",  name: "Intesa Sanpaolo" },
  { sym: "UCG.MI",  name: "UniCredit" },
  { sym: "ENI.MI",  name: "Eni S.p.A." },
  { sym: "ENEL.MI", name: "Enel S.p.A." },
  { sym: "SPY",     name: "S&P 500 ETF" },
];

const SECTORS = [
  { name: "Financials",  pct:  1.9 },
  { name: "Technology",  pct:  1.4 },
  { name: "Industrials", pct:  0.8 },
  { name: "Utilities",   pct:  0.2 },
  { name: "Energy",      pct: -1.1 },
  { name: "Real Estate", pct: -1.8 },
];

const SIGNALS = [
  { tone: "pos", title: "ISP.MI — Breakout above 200-day MA on rising volume. RSI 58, room to run.", meta: "Momentum · High confidence · 4 min ago" },
  { tone: "info", title: "ECB decision — Tomorrow 14:15 CET. Rate hold expected. Volatility spike likely in EUR/USD.", meta: "Macro event · Medium impact · 18 min ago" },
  { tone: "warn", title: "LVMH — Earnings beat +12% EPS. Luxury sector rotation opportunity into FR0000121014.", meta: "Fundamental · Medium confidence · 1 hr ago" },
];

function fmtMoney(v: number, ccy = "EUR") {
  const sym = ccy === "USD" ? "$" : "€";
  return `${sym}${v.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function ChangePill({ pct, className = "" }: { pct: number; className?: string }) {
  const positive = pct > 0.05;
  const negative = pct < -0.05;
  const cls = positive
    ? "bg-success/15 text-success"
    : negative
    ? "bg-destructive/15 text-destructive"
    : "bg-warning/15 text-warning";
  const sign = positive ? "+" : "";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] font-medium ${cls} ${className}`}>
      {sign}{pct.toFixed(pct === 0 ? 1 : 2)}%
    </span>
  );
}

function Sparkline({ trend, loading }: { trend: "up" | "down" | "flat"; loading?: boolean }) {
  if (loading) {
    return (
      <div className="h-[22px] w-16 rounded bg-muted/50 animate-pulse" aria-label="Loading price" />
    );
  }
  const stroke = trend === "up" ? "hsl(var(--success))" : trend === "down" ? "hsl(var(--destructive))" : "hsl(var(--warning))";
  const d = trend === "up"
    ? "M0,18 L10,15 L20,17 L30,12 L40,13 L50,8 L60,6"
    : trend === "down"
    ? "M0,8 L10,10 L20,9 L30,14 L40,13 L50,17 L60,19"
    : "M0,12 L10,11 L20,13 L30,12 L40,12 L50,13 L60,12";
  return (
    <svg width="64" height="22" viewBox="0 0 60 22" fill="none">
      <path d={d} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Index() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "trader";

  const syms = useMemo(() => WATCH.map((w) => w.sym).concat(["FTSEMIB.MI"]), []);
  const { quotes } = useLiveQuotes(syms, 30000);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const ftse = quotes["FTSEMIB.MI"];

  return (
    <>
      <SEO title="Dashboard · Vela.ai" description="Real-time market intelligence, AI signals, portfolio snapshot and macro briefing." path="/" />
      <div className="p-4 sm:p-6 space-y-5">
        {/* Greeting row */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight">
              {greeting}, {firstName}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {dateLabel} · European markets open
            </p>
          </div>
          <div className="inline-flex items-center rounded-lg bg-card p-1 border border-border">
            {(["1D","1W","1M","1Y"] as const).map((r, i) => (
              <button key={r} className={`px-3 py-1 text-xs font-medium rounded-md ${i===0 ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{r}</button>
            ))}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            { label: "Portfolio value",  value: "€84,320",  chg:  2.34, tone: "pos" as const, sub: "vs last close" },
            { label: "Today's P&L",      value: "+€1,924",  chg:  1.10, tone: "pos" as const, sub: "vs yesterday" },
            { label: "Active signals",   value: "12",        chg:  0,    tone: "info" as const, sub: "3 new today" },
            { label: "Sentiment score",  value: "67/100",    chg:  0,    tone: "pos" as const, sub: "Bullish" },
          ].map((m) => (
            <Card key={m.label} className="p-5 bg-card border-border animate-fade-in">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{m.label}</div>
              <div className="mt-2 font-mono text-2xl font-medium tracking-tight">{m.value}</div>
              <div className="mt-2 flex items-center gap-2">
                {m.chg !== 0
                  ? <ChangePill pct={m.chg} />
                  : <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${m.tone==="pos"?"bg-success/15 text-success":"bg-secondary/15 text-secondary"}`}>{m.sub}</span>}
                {m.chg !== 0 && <span className="text-[11px] text-muted-foreground">{m.sub}</span>}
              </div>
            </Card>
          ))}
        </div>

        {/* AI briefing band — personalised from portfolio + watchlist + saved focus */}
        <AIBriefing />

        {/* Chart + watchlist */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 p-5 bg-card border-border">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">FTSE MIB · IT0003465736</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Milan Stock Exchange · Delayed 15min</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xl font-medium">{ftse?.price?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "35,482"}</div>
                <ChangePill pct={ftse?.change ?? 1.24} className="mt-1" />
              </div>
            </div>

            {/* Stylised area chart */}
            <div className="mt-4 h-48 w-full">
              <svg viewBox="0 0 600 200" preserveAspectRatio="none" className="h-full w-full">
                <defs>
                  <linearGradient id="velaArea" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%"  stopColor="hsl(var(--primary))" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0,160 C60,150 90,140 140,135 C200,128 240,130 290,110 C340,92 380,95 430,75 C480,58 520,55 600,40 L600,200 L0,200 Z" fill="url(#velaArea)" />
                <path d="M0,160 C60,150 90,140 140,135 C200,128 240,130 290,110 C340,92 380,95 430,75 C480,58 520,55 600,40" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" />
                <circle cx="600" cy="40" r="4" fill="hsl(var(--primary))" />
              </svg>
              <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-1 px-1">
                <span>09:00</span><span>11:00</span><span>13:00</span><span>15:00</span><span>17:00</span>
              </div>
            </div>
          </Card>

          <Card className="p-5 bg-card border-border">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Watchlist</div>
              <button onClick={() => navigate("/watchlist")} className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">Edit <ChevronRight className="h-3 w-3" /></button>
            </div>
            <div className="mt-2 divide-y divide-border">
              {WATCH.map((w) => {
                const q = quotes[w.sym];
                const chg = q?.change ?? 0;
                const trend = chg > 0.1 ? "up" : chg < -0.1 ? "down" : "flat";
                const price = q?.price;
                const ccy = q?.currency || (w.sym.endsWith(".MI") ? "EUR" : "USD");
                return (
                  <button key={w.sym} onClick={() => navigate(`/stock/${encodeURIComponent(w.sym)}`)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-muted/40 rounded-md -mx-2 px-2">
                    <span className={`h-2 w-2 rounded-full ${!q ? "bg-muted-foreground/30" : trend==="up"?"bg-success":trend==="down"?"bg-destructive":"bg-warning"}`} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold leading-tight">{w.sym}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{w.name}</div>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <Sparkline trend={trend} loading={!q} />
                      <div className="text-right">
                        <div className="font-mono text-[12px]">{price != null ? fmtMoney(price, ccy) : "—"}</div>
                        {q ? <ChangePill pct={chg} /> : <span className="text-[11px] text-muted-foreground/60">—</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Sectors + Signals */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5 bg-card border-border">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Sector performance</div>
              <div className="text-[11px] text-muted-foreground">vs index today</div>
            </div>
            <div className="mt-3 space-y-2">
              {SECTORS.map((s) => {
                const positive = s.pct > 0;
                const widthPct = Math.min(100, Math.abs(s.pct) * 30);
                return (
                  <div key={s.name} className="flex items-center gap-3 py-1">
                    <div className="w-24 text-[12px]">{s.name}</div>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${positive ? "bg-success" : "bg-destructive"}`}
                        style={{ width: `${widthPct}%`, marginLeft: positive ? 0 : `${100 - widthPct}%` }}
                      />
                    </div>
                    <div className={`w-12 text-right font-mono text-[11px] font-medium ${positive ? "text-success" : "text-destructive"}`}>
                      {positive ? "+" : ""}{s.pct.toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-5 bg-card border-border">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">AI signals</div>
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">3 new</span>
            </div>
            <div className="mt-2 divide-y divide-border">
              {SIGNALS.map((s, i) => {
                const Icon = s.tone === "pos" ? TrendingUp : s.tone === "warn" ? TrendingDown : Clock;
                const bg = s.tone === "pos" ? "bg-success/15 text-success"
                  : s.tone === "warn" ? "bg-warning/15 text-warning"
                  : "bg-secondary/15 text-secondary";
                return (
                  <div key={i} className="flex items-start gap-3 py-3">
                    <div className={`h-8 w-8 shrink-0 rounded-lg flex items-center justify-center ${bg}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12.5px] leading-snug">{s.title}</div>
                      <div className="text-[11px] text-muted-foreground mt-1">{s.meta}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
