import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles, Loader2, TrendingUp, TrendingDown, Minus, Eye, MessageSquare, X, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { persistDashboardTourSeen } from "@/components/dashboard/DashboardTour";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const FALLBACK_TICKERS = [
  { sym: "AAPL", name: "Apple" },
  { sym: "TSLA", name: "Tesla" },
  { sym: "NVDA", name: "NVIDIA" },
];

type SignalDriver = { title: string; impact: "positive" | "negative" | "neutral" };
type SignalResult = {
  symbol: string;
  score: number;
  label: string;
  summary: string;
  drivers: SignalDriver[];
};

type Step = "welcome" | "signal";

function track(event: string, payload?: Record<string, unknown>) {
  try {
    // Reuse whatever telemetry sink is available; fallback to console.
    (window as any).plausible?.(event, { props: payload });
    // eslint-disable-next-line no-console
    console.info("[onboarding]", event, payload ?? {});
  } catch {
    /* ignore */
  }
}

export function FirstRunJourney({ onComplete }: { onComplete: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("welcome");
  const [ticker, setTicker] = useState("");
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SignalResult | null>(null);
  const [hotTickers, setHotTickers] = useState<{ sym: string; name: string }[]>(FALLBACK_TICKERS);
  const [autoStarted, setAutoStarted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Autofocus + analytics on mount
  useEffect(() => {
    inputRef.current?.focus();
    track("onboarding_start");
  }, []);

  // Load today's most-scanned tickers (rotating, server-cached per UTC day).
  // Falls back to a same-day localStorage cache, then to static defaults.
  useEffect(() => {
    let cancelled = false;
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `vela.hotTickers.${today}`;

    // 1) synchronous localStorage read to keep first paint stable
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { sym: string; name: string }[];
        if (Array.isArray(parsed) && parsed.length >= 3) setHotTickers(parsed);
      }
    } catch { /* ignore */ }

    // 2) refresh from server (cached per-day server-side)
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("hot-tickers", { body: {} });
        if (cancelled) return;
        const t = (data as any)?.tickers;
        if (Array.isArray(t) && t.length >= 3) {
          setHotTickers(t);
          try { localStorage.setItem(cacheKey, JSON.stringify(t)); } catch { /* ignore */ }
        }
      } catch {
        /* keep whatever we have */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-select the first hot-start ticker on load so users see a signal
  // immediately. Users can still click "← Try another" to pick a different one.
  useEffect(() => {
    if (autoStarted) return;
    if (step !== "welcome") return;
    if (!hotTickers.length) return;
    setAutoStarted(true);
    track("onboarding_auto_default", { symbol: hotTickers[0].sym });
    fetchSignal(hotTickers[0].sym);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotTickers, autoStarted, step]);

  // ESC = skip
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleSkip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markSeen = useCallback(async () => {
    try { localStorage.setItem("vela.firstRun.done", "1"); } catch { /* ignore */ }
    if (user?.id) await persistDashboardTourSeen(user.id);
  }, [user?.id]);

  const handleSkip = useCallback(async () => {
    track("onboarding_skip_intro", { step });
    await markSeen();
    onComplete();
  }, [markSeen, onComplete, step]);

  const handleExplore = useCallback(async () => {
    track("onboarding_explore_dashboard", { symbol: activeSymbol });
    await markSeen();
    onComplete();
  }, [markSeen, onComplete, activeSymbol]);

  const handleConnectPortfolio = useCallback(async () => {
    track("onboarding_cta_connect_portfolio");
    await markSeen();
    track("onboarding_complete", { via: "connect_portfolio" });
    navigate("/portfolio");
  }, [markSeen, navigate]);

  const handleRetry = useCallback(() => {
    if (!activeSymbol) return;
    track("onboarding_signal_retry", { symbol: activeSymbol });
    fetchSignal(activeSymbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol]);

  const fetchSignal = useCallback(async (raw: string) => {
    const sym = raw.trim().toUpperCase();
    if (!sym) return;
    setActiveSymbol(sym);
    setStep("signal");
    setLoading(true);
    setError(null);
    setResult(null);
    track("onboarding_ticker_chosen", { symbol: sym });
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("analyze-sentiment", {
        body: { symbol: sym },
      });
      if (fnErr) throw fnErr;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as SignalResult);
      track("onboarding_signal_revealed", { symbol: sym });
      // move focus to the result card for screen readers
      setTimeout(() => cardRef.current?.focus(), 50);
    } catch (e: any) {
      setError(e?.message || "Couldn't fetch a signal right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAddToWatchlist = useCallback(async () => {
    if (!activeSymbol || !user) return;
    track("onboarding_cta_watchlist", { symbol: activeSymbol });
    try {
      await supabase.from("watchlist_items").insert({ user_id: user.id, symbol: activeSymbol, name: activeSymbol });
      toast.success(`${activeSymbol} added to your watchlist`);
    } catch {
      toast.error("Couldn't save to watchlist");
    }
    await markSeen();
    track("onboarding_complete", { via: "watchlist", symbol: activeSymbol });
    onComplete();
  }, [activeSymbol, user, markSeen, onComplete]);

  const handleAskFollowup = useCallback(async () => {
    if (!activeSymbol) return;
    track("onboarding_cta_assistant", { symbol: activeSymbol });
    await markSeen();
    track("onboarding_complete", { via: "assistant", symbol: activeSymbol });
    navigate(`/copilot?q=${encodeURIComponent(`Tell me more about ${activeSymbol}`)}`);
  }, [activeSymbol, markSeen, navigate, navigate]);

  const scoreTone = (score: number) =>
    score >= 60 ? { label: "Bullish", icon: TrendingUp, cls: "text-success bg-success/10" }
    : score <= 40 ? { label: "Bearish", icon: TrendingDown, cls: "text-destructive bg-destructive/10" }
    : { label: "Neutral", icon: Minus, cls: "text-muted-foreground bg-muted" };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-run-title"
      className="relative rounded-3xl border border-border bg-card dark:bg-[hsl(var(--surface-glass))] dark:backdrop-blur-xl dark:border-[hsl(var(--border-glass))] dark:shadow-[var(--shadow-glass)] p-6 sm:p-10 min-h-[420px] flex flex-col"
    >
      <button
        onClick={handleSkip}
        aria-label="Skip introduction"
        className="absolute top-4 right-4 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Skip intro <X className="h-3.5 w-3.5" />
      </button>

      {step === "welcome" && (
        <div className="m-auto w-full max-w-2xl text-center space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Welcome to Vela
          </div>
          <h1 id="first-run-title" className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Research any stock in your portfolio — in 10 seconds.
          </h1>
          <p className="text-sm text-muted-foreground">
            Pick one of today's most-scanned tickers or type your own. No setup, no forms.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {hotTickers.map((t) => (
              <button
                key={t.sym}
                onClick={() => fetchSignal(t.sym)}
                className="group inline-flex items-center gap-2 rounded-xl border border-border bg-background/60 px-4 py-3 text-sm font-semibold text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="tabular-nums">{t.sym}</span>
                <span className="text-xs font-normal text-muted-foreground">{t.name}</span>
                <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
              </button>
            ))}
          </div>

          <form
            className="flex items-center gap-2 pt-2 max-w-md mx-auto"
            onSubmit={(e) => { e.preventDefault(); fetchSignal(ticker); }}
          >
            <input
              ref={inputRef}
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="Try your own: e.g. MSFT"
              aria-label="Enter a ticker symbol"
              className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="submit"
              disabled={!ticker.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Get signal <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="pt-2">
            <button
              onClick={handleConnectPortfolio}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              <Briefcase className="h-3.5 w-3.5" />
              Or connect your portfolio to research what you already own
            </button>
          </div>
        </div>
      )}

      {step === "signal" && (
        <div ref={cardRef} tabIndex={-1} className="m-auto w-full max-w-2xl focus-visible:outline-none">
          <button
            onClick={() => { setStep("welcome"); setResult(null); setError(null); setActiveSymbol(null); }}
            className="mb-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Try another
          </button>

          <div className="flex items-baseline justify-between mb-1">
            <h2 className="text-2xl font-bold text-foreground">{activeSymbol}</h2>
            {result && (() => {
              const t = scoreTone(result.score);
              const Icon = t.icon;
              return (
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", t.cls)}>
                  <Icon className="h-3.5 w-3.5" />
                  {result.label || t.label} · {Math.round(result.score)}/100
                </span>
              );
            })()}
          </div>
          <div className="h-px bg-border my-4" />

          <div aria-live="polite" className="min-h-[140px]">
            {loading && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Vela is reading the latest news, filings and price action…
              </div>
            )}
            {error && !loading && (
              <div className="space-y-3">
                <p className="text-sm text-destructive">{error}</p>
                <button
                  onClick={handleRetry}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40"
                >
                  Retry
                </button>
              </div>
            )}
            {result && !loading && (
              <div className="space-y-4">
                {result.summary && (
                  <p className="text-sm text-foreground leading-relaxed">{result.summary}</p>
                )}
                {result.drivers?.length > 0 && (
                  <ul className="space-y-2">
                    {result.drivers.slice(0, 3).map((d, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                        <span className={cn(
                          "mt-1.5 h-1.5 w-1.5 rounded-full shrink-0",
                          d.impact === "positive" ? "bg-success" : d.impact === "negative" ? "bg-destructive" : "bg-muted-foreground",
                        )} />
                        <span>{d.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {result && !loading && (
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                onClick={handleAddToWatchlist}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Eye className="h-4 w-4" /> Add to watchlist
              </button>
              <button
                onClick={handleAskFollowup}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MessageSquare className="h-4 w-4" /> Ask a follow-up
              </button>
              <button
                onClick={handleExplore}
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Explore dashboard
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FirstRunJourney;