import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { TrendingUp, TrendingDown, Clock, ChevronRight, AlertTriangle } from "lucide-react";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useAuth } from "@/hooks/useAuth";
import { AIBriefing } from "@/components/AIBriefing";
import { PortfolioSuggestions } from "@/components/PortfolioSuggestions";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { supabase } from "@/integrations/supabase/client";
import { usePortfolios } from "@/hooks/usePortfolios";

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
    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
    : negative
    ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
    : "bg-amber-500/10 text-amber-400 border border-amber-500/20";
  const sign = positive ? "+" : "";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${cls} ${className}`}>
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
  const { primary } = usePortfolios();
  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "trader";

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

  const ftse = quotes["FTSEMIB.MI"];

  return (
    <>
      <SEO title="Dashboard · Vela.ai" description="Real-time market intelligence, AI signals, portfolio snapshot and macro briefing." path="/" />
      <div className="p-6 sm:p-8 space-y-8 font-[Manrope] text-[#e8edf3] bg-[#0f1b3d] min-h-screen">
        {/* Greeting row */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-[Sora]">
              {greeting}, {firstName}
            </h1>
            <p className="text-sm text-[#e8edf3]/60 mt-1">
              {dateLabel} · European markets open
            </p>
          </div>
          <div className="inline-flex items-center rounded-lg bg-[#1e3a5f]/50 p-1 border border-[#3b6fa0]/20">
            {(["1D","1W","1M","1Y"] as const).map((r, i) => (
              <button key={r} className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${i===0 ? "bg-[#3b6fa0] text-white shadow-lg" : "text-[#e8edf3]/70 hover:bg-[#3b6fa0]/30 hover:text-white"}`}>{r}</button>
            ))}
          </div>
        </div>

        <OnboardingChecklist />

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {(() => {
            const empty = portfolio.count === 0;
            const pnlSign = portfolio.dayPnl >= 0 ? "+" : "−";
            const cards = [
              {
                label: "Portfolio value",
                value: empty ? "—" : fmtMoney(portfolio.value),
                chg: empty ? 0 : Number(portfolio.dayPct.toFixed(2)),
                tone: "pos" as const,
                sub: empty ? "Add a holding to track" : portfolio.hasPrice ? "vs last close" : "cost basis (no live price)",
              },
              {
                label: "Today's P&L",
                value: empty ? "—" : `${pnlSign}${fmtMoney(Math.abs(portfolio.dayPnl))}`,
                chg: empty ? 0 : Number(portfolio.dayPct.toFixed(2)),
                tone: "pos" as const,
                sub: empty ? "—" : "vs yesterday",
              },
              {
                label: "Active signals",
                value: activeSignalCount == null ? "—" : String(activeSignalCount),
                chg: 0,
                tone: "info" as const,
                sub: activeSignalCount ? "alert rules" : "set up alerts",
              },
              {
                label: "Sentiment score",
                value: sentimentAvg == null ? "—" : `${Math.round(sentimentAvg)}/100`,
                chg: 0,
                tone: "pos" as const,
                sub: sentimentAvg == null ? "no data yet" : sentimentAvg >= 60 ? "Bullish" : sentimentAvg <= 40 ? "Bearish" : "Neutral",
              },
            ];
            return cards;
          })().map((m) => (
            <div key={m.label} className="bg-[#1e3a5f]/40 backdrop-blur-md border border-[#3b6fa0]/20 p-5 rounded-2xl flex flex-col justify-between animate-fade-in">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#e8edf3]/40">{m.label}</span>
              <div className="mt-2">
                <div className="text-2xl font-bold font-[Sora]">{m.value}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  {m.chg !== 0
                    ? <ChangePill pct={m.chg} />
                    : <span className="text-[10px] font-bold text-[#3b6fa0] hover:text-white uppercase transition-colors cursor-pointer">{m.sub}</span>}
                  {m.chg !== 0 && <span className="text-[10px] text-[#e8edf3]/40">{m.sub}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Main bento grid */}
        <div className="grid grid-cols-12 gap-6">
          {/* AI Briefing feature tile */}
          <div className="col-span-12 lg:col-span-5">
            <AIBriefing />
          </div>

          {/* Portfolio Suggestions */}
          <div className="col-span-12 lg:col-span-7">
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
              <div className="bg-[#1e3a5f]/20 border border-[#3b6fa0]/20 rounded-3xl p-6 flex flex-col justify-between h-full">
                <div>
                  <h3 className="text-lg font-bold font-[Sora]">Suggestions for My Portfolio</h3>
                  <p className="text-xs text-[#e8edf3]/50 mt-1">AI-driven research from the Portfolio Coach. Not investment advice.</p>
                </div>
                <div className="mt-8 grid grid-cols-3 gap-4">
                  <button onClick={() => navigate("/advisor")} className="p-4 rounded-2xl bg-[#0f1b3d]/50 border border-[#3b6fa0]/10 hover:border-[#3b6fa0]/50 transition-all text-left space-y-2">
                    <div className="text-[#3b6fa0]"><Sparkline trend="up" /></div>
                    <div className="text-xs font-bold">Portfolio Coach</div>
                  </button>
                  <button onClick={() => navigate("/rebalance")} className="p-4 rounded-2xl bg-[#0f1b3d]/50 border border-[#3b6fa0]/10 hover:border-[#3b6fa0]/50 transition-all text-left space-y-2">
                    <div className="text-[#3b6fa0]"><Sparkline trend="flat" /></div>
                    <div className="text-xs font-bold">Rebalance</div>
                  </button>
                  <button onClick={() => navigate("/optimizer")} className="p-4 rounded-2xl bg-[#0f1b3d]/50 border border-[#3b6fa0]/10 hover:border-[#3b6fa0]/50 transition-all text-left space-y-2">
                    <div className="text-[#3b6fa0]"><Sparkline trend="up" /></div>
                    <div className="text-xs font-bold">Optimizer</div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* FTSE MIB chart */}
          <div className="col-span-12 lg:col-span-8 bg-[#1e3a5f]/20 border border-[#3b6fa0]/10 rounded-3xl p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold font-[Sora]">FTSE MIB · IT0003465736</h3>
                <p className="text-xs text-[#e8edf3]/40 mt-0.5">Milan Stock Exchange · Delayed 15min</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold font-[Sora]">{ftse?.price?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "35,482"}</div>
                <ChangePill pct={ftse?.change ?? 1.24} className="mt-1" />
              </div>
            </div>
            <div className="h-48 relative">
              <svg className="w-full h-full" viewBox="0 0 800 200" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b6fa0" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#3b6fa0" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0,180 Q100,160 200,140 T400,100 T600,60 T800,20 L800,200 L0,200 Z" fill="url(#chartGradient)" />
                <path d="M0,180 Q100,160 200,140 T400,100 T600,60 T800,20" fill="none" stroke="#3b6fa0" strokeWidth="3" />
              </svg>
              <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[10px] text-[#e8edf3]/30 pt-4">
                <span>09:00</span><span>11:00</span><span>13:00</span><span>15:00</span><span>17:00</span>
              </div>
            </div>
          </div>

          {/* Watchlist */}
          <div className="col-span-12 lg:col-span-4 bg-[#1e3a5f]/20 border border-[#3b6fa0]/10 rounded-3xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold font-[Sora]">Watchlist</h3>
              <button onClick={() => navigate("/watchlist")} className="text-xs font-bold text-[#3b6fa0] hover:text-white inline-flex items-center gap-0.5">Edit <ChevronRight className="h-3 w-3" /></button>
            </div>
            <div className="space-y-4">
              {WATCH.map((w) => {
                const q = quotes[w.sym];
                const chg = q?.change ?? 0;
                const trend = chg > 0.1 ? "up" : chg < -0.1 ? "down" : "flat";
                const price = q?.price;
                const ccy = q?.currency || (w.sym.endsWith(".MI") ? "EUR" : "USD");
                const indicatorCls = !q ? "bg-[#e8edf3]/20" : trend === "up" ? "bg-emerald-500" : trend === "down" ? "bg-rose-500" : "bg-amber-500";
                return (
                  <button key={w.sym} onClick={() => navigate(`/stock/${encodeURIComponent(w.sym)}`)} className="flex w-full items-center justify-between group cursor-pointer text-left">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-1 h-6 rounded-full ${indicatorCls}`} />
                      <div className="min-w-0">
                        <div className="text-sm font-bold truncate">{w.sym}</div>
                        <div className="text-[10px] text-[#e8edf3]/40 truncate">{w.name}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold font-[Sora]">{price != null ? fmtMoney(price, ccy) : "—"}</div>
                      {q ? <div className={`text-[10px] font-bold ${chg >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</div> : <span className="text-[10px] text-[#e8edf3]/30">—</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sector performance */}
          <div className="col-span-12 lg:col-span-6 bg-[#1e3a5f]/20 border border-[#3b6fa0]/10 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold font-[Sora]">Sector performance</h3>
              <span className="text-[10px] font-bold text-[#3b6fa0] uppercase tracking-widest">vs index today</span>
            </div>
            <div className="space-y-4">
              {SECTORS.map((s) => {
                const positive = s.pct > 0;
                const widthPct = Math.min(100, Math.abs(s.pct) * 30);
                return (
                  <div key={s.name} className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold uppercase">
                      <span>{s.name}</span>
                      <span className={positive ? "text-emerald-400" : "text-rose-400"}>{positive ? "+" : ""}{s.pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-[#0f1b3d] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${positive ? "bg-emerald-500" : "bg-rose-500"}`}
                        style={{ width: `${widthPct}%`, marginLeft: positive ? 0 : `${100 - widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI signals */}
          <div className="col-span-12 lg:col-span-6 bg-[#1e3a5f]/20 border border-[#3b6fa0]/10 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold font-[Sora]">AI signals</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-[#3b6fa0]/20 text-[#3b6fa0] rounded-full">3 NEW</span>
            </div>
            <div className="space-y-4">
              {SIGNALS.map((s, i) => {
                const Icon = s.tone === "pos" ? TrendingUp : s.tone === "warn" ? TrendingDown : Clock;
                const bg = s.tone === "pos" ? "bg-emerald-500/10 text-emerald-400"
                  : s.tone === "warn" ? "bg-rose-500/10 text-rose-400"
                  : "bg-blue-500/10 text-blue-400";
                return (
                  <div key={i} className="flex gap-4">
                    <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${bg}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div className="text-xs font-bold leading-snug">{s.title}</div>
                      <p className="text-[10px] text-[#e8edf3]/50 leading-tight">{s.meta}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Disclaimer strip */}
        <div className="p-6 bg-amber-400/5 border border-amber-400/20 rounded-2xl flex gap-4">
          <div className="w-8 h-8 shrink-0 rounded-lg bg-amber-400/10 flex items-center justify-center text-amber-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <p className="text-[10px] text-amber-400/80 leading-relaxed uppercase tracking-tighter">
            <span className="font-bold">Not investment advice.</span> Vela.ai is an information tool, not a regulated financial advisor or broker. All content is informational only. Past performance does not guarantee future results. Consult a licensed advisor before making investment decisions.
          </p>
        </div>
      </div>
    </>
  );
}
