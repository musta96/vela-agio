import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { TrendingUp, TrendingDown, Clock, ChevronRight, Home, RefreshCw } from "lucide-react";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useAuth } from "@/hooks/useAuth";
import { AIBriefing } from "@/components/AIBriefing";
import { PortfolioSuggestions } from "@/components/PortfolioSuggestions";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { AiDisclaimerStrip } from "@/components/AiDisclaimerStrip";
import { supabase } from "@/integrations/supabase/client";
import { usePortfolios } from "@/hooks/usePortfolios";
import { MiniSparkline } from "@/components/ui/mini-sparkline";
import { useMarketClock } from "@/hooks/useMarketClock";
import { useNetWorthTotal } from "@/hooks/useNetWorthTotal";
import { CATEGORY_META, CATEGORY_ORDER, type CategoryKey } from "@/data/netWorthCategories";

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
    ? "bg-success/10 text-success"
    : negative
    ? "bg-destructive/10 text-destructive"
    : "bg-muted text-muted-foreground";
  const sign = positive ? "+" : "";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${cls} ${className}`}>
      {sign}{pct.toFixed(pct === 0 ? 1 : 2)}%
    </span>
  );
}

function Sparkline({ trend }: { trend: "up" | "down" | "flat" }) {
  const stroke = trend === "up" ? "hsl(var(--success))" : trend === "down" ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))";
  const d = trend === "up"
    ? "M0,18 L10,15 L20,17 L30,12 L40,13 L50,8 L60,6"
    : trend === "down"
    ? "M0,8 L10,10 L20,9 L30,14 L40,13 L50,17 L60,19"
    : "M0,12 L10,11 L20,13 L30,12 L40,12 L50,13 L60,12";
  return (
    <svg width="64" height="22" viewBox="0 0 60 22" fill="none">
      <path d={d} stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Index() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { primary } = usePortfolios();
  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "trader";
  const [range, setRange] = useState<"1D"|"1W"|"1M"|"3M"|"YTD"|"1Y">("1W");

  // Real net worth (FX-converted, shared with /net-worth page)
  const netWorth = useNetWorthTotal("EUR");

  // Live holdings for real portfolio value
  const [holdings, setHoldings] = useState<Array<{ symbol: string; name: string; shares: number; avg_price: number; currency: string }>>([]);
  const [activeSignalCount, setActiveSignalCount] = useState<number | null>(null);
  const [sentimentAvg, setSentimentAvg] = useState<number | null>(null);

  useEffect(() => {
    if (!user) { setHoldings([]); return; }
    (async () => {
      const holdingsQuery = primary?.id
        ? supabase.from("portfolio_holdings").select("symbol, name, shares, avg_price, currency").eq("portfolio_id", primary.id)
        : supabase.from("portfolio_holdings").select("symbol, name, shares, avg_price, currency").eq("user_id", user.id);
      const [h, rules, sent] = await Promise.all([
        holdingsQuery,
        supabase.from("alert_rules").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("enabled", true),
        supabase.from("sentiment_history").select("score").order("created_at", { ascending: false }).limit(50),
      ]);
      setHoldings((h.data ?? []) as any);
      setActiveSignalCount(rules.count ?? 0);
      const scores = (sent.data ?? []).map((r: any) => Number(r.score)).filter((n) => Number.isFinite(n));
      setSentimentAvg(scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null);
    })();
  }, [user?.id, primary?.id]);

  const syms = useMemo(() => {
    const set = new Set<string>([...WATCH.map((w) => w.sym), "FTSEMIB.MI", ...holdings.map((h) => h.symbol)]);
    return Array.from(set);
  }, [holdings]);
  const { quotes } = useLiveQuotes(syms, 30000);

  // Real portfolio metrics
  const portfolio = useMemo(() => {
    let value = 0, prevValue = 0, cost = 0, hasPrice = false;
    for (const h of holdings) {
      const q = quotes[h.symbol];
      const px = q?.price;
      const prev = q?.previousClose;
      cost += h.shares * Number(h.avg_price ?? 0);
      if (px != null) {
        hasPrice = true;
        value += h.shares * px;
        prevValue += h.shares * (prev ?? px);
      } else {
        // fall back to cost basis so partial pricing doesn't blow up totals
        value += h.shares * Number(h.avg_price ?? 0);
        prevValue += h.shares * Number(h.avg_price ?? 0);
      }
    }
    const dayPnl = value - prevValue;
    const dayPct = prevValue > 0 ? (dayPnl / prevValue) * 100 : 0;
    return { value, dayPnl, dayPct, cost, hasPrice, count: holdings.length };
  }, [holdings, quotes]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const mc = useMarketClock();
  const timeLabel = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone: mc.market.timezone });

  const ftse = quotes["FTSEMIB.MI"];

  return (
    <>
      <SEO title="Dashboard · Vela.ai" description="Real-time market intelligence, AI signals, portfolio snapshot and macro briefing." path="/" />
      <div className="p-6 sm:p-8 space-y-6">
        {/* Greeting row — icon chip + title, range + refresh on right */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-4 min-w-0">
            <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Home className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-bold tracking-tight text-foreground leading-tight">
                {greeting}, {firstName}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {dateLabel} · {mc.market.label} markets {mc.short.toLowerCase()} · {timeLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-lg bg-card border border-border p-1">
              {(["1D","1W","1M","3M","YTD","1Y"] as const).map((r) => (
                <button key={r} onClick={() => setRange(r)} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${range===r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{r}</button>
              ))}
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-card border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/40 transition-colors">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
        </div>

        <OnboardingChecklist />

        {/* KPI strip — 5 cells: portfolio, P&L, net worth, sentiment, signals */}
        <div className="bg-card border border-border rounded-2xl divide-y sm:divide-y-0 sm:divide-x divide-border grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {(() => {
            const empty = portfolio.count === 0;
            const pnlSign = portfolio.dayPnl >= 0 ? "+" : "−";
            const cards = [
              {
                label: "Portfolio value",
                value: empty ? "—" : fmtMoney(portfolio.value),
                chg: empty ? 0 : Number(portfolio.dayPct.toFixed(2)),
                sub: empty ? "Add a holding to track" : portfolio.hasPrice ? "vs last close" : "cost basis (no live price)",
              },
              {
                label: "Today's P&L",
                value: empty ? "—" : `${pnlSign}${fmtMoney(Math.abs(portfolio.dayPnl))}`,
                chg: empty ? 0 : Number(portfolio.dayPct.toFixed(2)),
                sub: empty ? "—" : "vs yesterday",
              },
              {
                label: "Net worth",
                value: netWorth.accountCount === 0 ? "—" : fmtMoney(netWorth.total),
                chg: 0,
                sub: netWorth.accountCount === 0 ? "Add accounts in Net Worth" : `${netWorth.accountCount} accounts · FX-adjusted`,
              },
              {
                label: "Sentiment",
                value: sentimentAvg == null ? "70/100" : `${Math.round(sentimentAvg)}/100`,
                chg: 0,
                sub: sentimentAvg == null ? "Bullish" : sentimentAvg >= 60 ? "Bullish" : sentimentAvg <= 40 ? "Bearish" : "Neutral",
              },
              {
                label: "Active signals",
                value: activeSignalCount == null ? "—" : String(activeSignalCount),
                chg: 0,
                sub: activeSignalCount ? "alert rules" : "set up alerts",
              },
            ];
            return cards;
          })().map((m) => (
            <div key={m.label} className="p-5 flex flex-col gap-2">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{m.label}</span>
              <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{m.value}</div>
              <div className="flex items-center gap-2">
                {m.chg !== 0 && <ChangePill pct={m.chg} />}
                <span className="text-xs text-muted-foreground">{m.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Main bento — AI briefing hero (wide dark navy) + right rail */}
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8">
            <AIBriefing />
          </div>
          <div className="col-span-12 lg:col-span-4 bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">Today at a glance</h3>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-4">
              {[
                { t: "09:00", l: "Italy CPI flash", k: "Macro" },
                { t: "14:15", l: "ECB rate decision", k: "Central bank" },
                { t: "15:30", l: "US jobless claims", k: "Macro" },
                { t: "22:00", l: "NVDA earnings", k: "Earnings" },
              ].map((e) => (
                <div key={e.t} className="flex items-start gap-3">
                  <span className="text-xs font-mono font-semibold text-primary w-12 shrink-0 pt-0.5">{e.t}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{e.l}</div>
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{e.k}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Portfolio Suggestions */}
          <div className="col-span-12">
            {user && holdings.length > 0 ? (
              <PortfolioSuggestions
                compact
                portfolioId={primary?.id ?? null}
                portfolioName={primary?.name ?? "Main portfolio"}
                holdings={holdings.map((h) => ({
                  symbol: h.symbol,
                  name: h.name || h.symbol,
                  shares: Number(h.shares) || 0,
                  avg_price: Number(h.avg_price) || 0,
                }))}
              />
            ) : (
              <div className="bg-card border border-border rounded-2xl p-6">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Suggestions for your portfolio</h3>
                  <p className="text-xs text-muted-foreground mt-1">AI-driven research from the Portfolio Coach. Not investment advice.</p>
                </div>
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: "Portfolio Coach", trend: "up" as const, to: "/advisor" },
                    { label: "Rebalance", trend: "flat" as const, to: "/rebalance" },
                    { label: "Optimizer", trend: "up" as const, to: "/optimizer" },
                  ].map((b) => (
                    <button key={b.label} onClick={() => navigate(b.to)} className="p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-muted/40 transition-all text-left space-y-2">
                      <Sparkline trend={b.trend} />
                      <div className="text-sm font-semibold text-foreground">{b.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* FTSE MIB chart */}
          <div className="col-span-12 lg:col-span-8 bg-card border border-border rounded-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-base font-semibold text-foreground">FTSE MIB · IT0003465736</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Milan Stock Exchange · Delayed 15min</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold tabular-nums text-foreground">{ftse?.price?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "35,482"}</div>
                <ChangePill pct={ftse?.change ?? 1.24} className="mt-1" />
              </div>
            </div>
            <div className="h-48 relative">
              <svg className="w-full h-full" viewBox="0 0 800 200" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0,180 Q100,160 200,140 T400,100 T600,60 T800,20 L800,200 L0,200 Z" fill="url(#chartGradient)" />
                <path d="M0,180 Q100,160 200,140 T400,100 T600,60 T800,20" fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" />
              </svg>
              <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[10px] text-muted-foreground pt-4">
                <span>09:00</span><span>11:00</span><span>13:00</span><span>15:00</span><span>17:00</span>
              </div>
            </div>
          </div>

          {/* Watchlist */}
          <div className="col-span-12 lg:col-span-4 bg-card border border-border rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-semibold text-foreground">Watchlist</h3>
              <button onClick={() => navigate("/watchlist")} className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-0.5">Edit <ChevronRight className="h-3 w-3" /></button>
            </div>
            <div className="space-y-3">
              {WATCH.map((w) => {
                const q = quotes[w.sym];
                const chg = q?.change ?? 0;
                const trend = chg > 0.1 ? "up" : chg < -0.1 ? "down" : "flat";
                const price = q?.price;
                const ccy = q?.currency || (w.sym.endsWith(".MI") ? "EUR" : "USD");
                const indicatorCls = !q ? "bg-muted" : trend === "up" ? "bg-success" : trend === "down" ? "bg-destructive" : "bg-warning";
                return (
                  <button key={w.sym} onClick={() => navigate(`/stock/${encodeURIComponent(w.sym)}`)} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 w-full text-left py-1.5 rounded-lg hover:bg-muted/40 -mx-2 px-2 transition-colors">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{w.sym}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{w.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums text-foreground">{price != null ? fmtMoney(price, ccy) : "—"}</div>
                      {q ? <div className={`text-[11px] font-semibold tabular-nums ${chg >= 0 ? "text-success" : "text-destructive"}`}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</div> : <span className="text-[11px] text-muted-foreground">—</span>}
                    </div>
                    <MiniSparkline trend={trend} width={64} height={22} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sector performance */}
          <div className="col-span-12 lg:col-span-4 bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-foreground">Sector performance</h3>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">vs index today</span>
            </div>
            <div className="space-y-3">
              {SECTORS.map((s) => {
                const positive = s.pct > 0;
                const widthPct = Math.min(100, Math.abs(s.pct) * 30);
                return (
                  <div key={s.name} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-foreground">{s.name}</span>
                      <span className={`tabular-nums ${positive ? "text-success" : "text-destructive"}`}>{positive ? "+" : ""}{s.pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${positive ? "bg-success" : "bg-destructive"}`}
                        style={{ width: `${widthPct}%`, marginLeft: positive ? 0 : `${100 - widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI signals */}
          <div className="col-span-12 lg:col-span-4 bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-foreground">AI signals</h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 bg-primary/10 text-primary rounded-full uppercase tracking-wider">3 new</span>
            </div>
            <div className="space-y-4">
              {SIGNALS.map((s, i) => {
                const Icon = s.tone === "pos" ? TrendingUp : s.tone === "warn" ? TrendingDown : Clock;
                const bg = s.tone === "pos" ? "bg-success/10 text-success"
                  : s.tone === "warn" ? "bg-destructive/10 text-destructive"
                  : "bg-primary/10 text-primary";
                return (
                  <div key={i} className="flex gap-4">
                    <div className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center ${bg}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div className="text-sm font-medium leading-snug text-foreground">{s.title}</div>
                      <p className="text-[11px] text-muted-foreground leading-tight">{s.meta}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Net worth allocation donut */}
          <div className="col-span-12 lg:col-span-4 bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-foreground">Net worth allocation</h3>
              <button onClick={() => navigate("/net-worth")} className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-0.5">View detail <ChevronRight className="h-3 w-3" /></button>
            </div>
            {(() => {
              const slices = [
                { label: "Investments", pct: 42, color: "hsl(var(--primary))" },
                { label: "Real Estate", pct: 30, color: "hsl(262 83% 58%)" },
                { label: "Cash", pct: 14, color: "hsl(var(--success))" },
                { label: "Retirement", pct: 8, color: "hsl(38 92% 50%)" },
                { label: "Crypto", pct: 4, color: "hsl(var(--destructive))" },
                { label: "Other", pct: 2, color: "hsl(var(--muted-foreground))" },
              ];
              const total = slices.reduce((s, x) => s + x.pct, 0);
              const C = 2 * Math.PI * 44;
              let offset = 0;
              return (
                <div className="flex items-center gap-5">
                  <div className="relative shrink-0">
                    <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
                      {slices.map((s) => {
                        const len = (s.pct / total) * C;
                        const el = (
                          <circle key={s.label} cx="64" cy="64" r="44" fill="none" stroke={s.color} strokeWidth="16" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />
                        );
                        offset += len;
                        return el;
                      })}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Net worth</span>
                      <span className="text-sm font-bold tabular-nums text-foreground">€186,420</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 text-xs min-w-0 flex-1">
                    {slices.map((s) => (
                      <div key={s.label} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 truncate"><span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} /><span className="truncate">{s.label}</span></span>
                        <span className="font-semibold tabular-nums">{s.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        <AiDisclaimerStrip />
      </div>
    </>
  );
}
