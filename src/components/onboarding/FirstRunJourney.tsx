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
    (window as any).plausible?.(event, { props: payload });
    // eslint-disable-next-line no-console
    console.info("[onboarding]", event, payload ?? {});
  } catch { /* ignore */ }
  // Persist server-side (fire-and-forget). RLS restricts inserts to auth.uid().
  try {
    void supabase.from("ai_event_log").insert({
      event_type: event,
      feature: "onboarding_first_run",
      payload: (payload ?? {}) as any,
    });
  } catch { /* ignore */ }
}

const MAX_RETRIES = 3;
function backoffMs(attempt: number) {
  // 600ms, 1400ms, 3000ms + small jitter
  const base = Math.min(600 * Math.pow(2, attempt), 3000);
  return base + Math.floor(Math.random() * 200);
}
function friendlyError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("timeout") || m.includes("network") || m.includes("fetch")) {
    return "We couldn't reach Vela's signal service. Check your connection and try again.";
  }
  if (m.includes("rate") || m.includes("429")) {
    return "Vela is a bit busy right now. Give it a moment and retry.";
  }
  if (m.includes("not found") || m.includes("unknown symbol") || m.includes("invalid")) {
    return "We couldn't find that ticker. Double-check the symbol and try again.";
  }
  return "We couldn't generate a signal right now. Please retry.";
}

export function FirstRunJourney({ onComplete }: { onComplete: (symbol?: string | null) => void }) {
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
  const [attempt, setAttempt] = useState(0);
  const [retryingIn, setRetryingIn] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const tickerRowRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef<number>(Date.now());
  const signalStartedAtRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Autofocus + analytics + focus-restore on unmount
  useEffect(() => {
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) ?? null;
    inputRef.current?.focus();
    startedAtRef.current = Date.now();
    track("onboarding_start");
    return () => {
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current);
      previouslyFocusedRef.current?.focus?.();
    };
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
    if (user?.id) {
      await persistDashboardTourSeen(user.id);
      // Persist first-run completion + selected symbol server-side so the
      // journey stays consistent across devices.
      try {
        await supabase.from("profiles").update({
          first_run_completed_at: new Date().toISOString(),
          first_run_symbol: activeSymbol,
        }).eq("user_id", user.id);
      } catch { /* ignore */ }
    }
  }, [user?.id, activeSymbol]);

  const handleSkip = useCallback(async () => {
    track("onboarding_skip_intro", { step });
    await markSeen();
    onComplete(activeSymbol);
  }, [markSeen, onComplete, step, activeSymbol]);

  const handleExplore = useCallback(async () => {
    track("onboarding_explore_dashboard", { symbol: activeSymbol });
    await markSeen();
    onComplete(activeSymbol);
  }, [markSeen, onComplete, activeSymbol]);

  const handleConnectPortfolio = useCallback(async () => {
    track("onboarding_cta_connect_portfolio");
    await markSeen();
    track("onboarding_complete", { via: "connect_portfolio" });
    navigate("/portfolio");
  }, [markSeen, navigate]);

  const handleRetry = useCallback(() => {
    if (!activeSymbol) return;
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current);
    setRetryingIn(null);
    setAttempt(0);
    track("onboarding_signal_retry", { symbol: activeSymbol, manual: true });
    fetchSignal(activeSymbol, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol]);

  const fetchSignal = useCallback(async (raw: string, retryAttempt = 0) => {
    const sym = raw.trim().toUpperCase();
    if (!sym) return;
    setActiveSymbol(sym);
    setStep("signal");
    setLoading(true);
    setError(null);
    setResult(null);
    setAttempt(retryAttempt);
    if (retryAttempt === 0) {
      signalStartedAtRef.current = Date.now();
      track("onboarding_ticker_chosen", { symbol: sym });
    }
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("analyze-sentiment", {
        body: { symbol: sym },
      });
      if (fnErr) throw fnErr;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as SignalResult);
      const ttfs = signalStartedAtRef.current ? Date.now() - signalStartedAtRef.current : null;
      track("onboarding_step_completed", { step: "signal_revealed", symbol: sym, time_to_first_signal_ms: ttfs, under_30s: ttfs !== null && ttfs <= 30_000, attempts: retryAttempt + 1 });
      track("onboarding_signal_revealed", { symbol: sym, time_to_first_signal_ms: ttfs });
      // Persist ttfs + symbol on the profile so success metrics survive reloads/devices.
      if (user?.id && ttfs !== null) {
        try {
          await supabase.from("profiles").update({
            first_run_symbol: sym,
            first_run_time_to_signal_ms: ttfs,
          }).eq("user_id", user.id);
        } catch { /* ignore */ }
      }
      // move focus to the result card for screen readers
      setTimeout(() => cardRef.current?.focus(), 50);
    } catch (e: any) {
      const raw = e?.message || "unknown error";
      // Auto-retry with exponential backoff up to MAX_RETRIES.
      if (retryAttempt < MAX_RETRIES - 1) {
        const wait = backoffMs(retryAttempt);
        track("onboarding_signal_retry", { symbol: sym, manual: false, attempt: retryAttempt + 1, wait_ms: wait });
        setError(`${friendlyError(raw)} Retrying automatically…`);
        setRetryingIn(Math.ceil(wait / 1000));
        if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = window.setInterval(() => {
          setRetryingIn((n) => (n && n > 1 ? n - 1 : null));
        }, 1000);
        retryTimerRef.current = window.setTimeout(() => {
          if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current);
          setRetryingIn(null);
          fetchSignal(sym, retryAttempt + 1);
        }, wait);
      } else {
        setError(friendlyError(raw));
        track("onboarding_signal_failed", { symbol: sym, attempts: retryAttempt + 1, raw });
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
    onComplete(activeSymbol);
  }, [activeSymbol, user, markSeen, onComplete]);

  const handleAskFollowup = useCallback(async () => {
    if (!activeSymbol) return;
    track("onboarding_cta_assistant", { symbol: activeSymbol });
    await markSeen();
    track("onboarding_complete", { via: "assistant", symbol: activeSymbol });
    navigate(`/copilot?q=${encodeURIComponent(`Tell me more about ${activeSymbol}`)}`);
  }, [activeSymbol, markSeen, navigate]);

  // Roving tab order across hot-ticker buttons: ArrowLeft/Right + Home/End.
  const onTickerRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      tickerRowRef.current?.querySelectorAll<HTMLButtonElement>('[data-ft-ticker="1"]') ?? []
    );
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    if (idx === -1) return;
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;
    e.preventDefault();
    items[next]?.focus();
  };

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

          <div
            ref={tickerRowRef}
            role="group"
            aria-label="Popular tickers — use arrow keys to move"
            onKeyDown={onTickerRowKeyDown}
            className="flex flex-wrap items-center justify-center gap-2 pt-2"
          >
            {hotTickers.map((t, i) => (
              <button
                key={t.sym}
                data-ft-ticker="1"
                tabIndex={i === 0 ? 0 : -1}
                onFocus={(e) => {
                  // roving: make focused item the only tabbable one
                  Array.from(tickerRowRef.current?.querySelectorAll<HTMLButtonElement>('[data-ft-ticker="1"]') ?? [])
                    .forEach((b) => (b.tabIndex = -1));
                  e.currentTarget.tabIndex = 0;
                }}
                onClick={() => fetchSignal(t.sym)}
                aria-label={`Analyze ${t.name} (${t.sym})`}
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

          <div aria-live="polite" aria-busy={loading} className="min-h-[140px]">
            {loading && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Vela is reading the latest news, filings and price action…
              </div>
            )}
            {error && !loading && (
              <div role="alert" className="space-y-3">
                <p className="text-sm text-destructive">{error}</p>
                {retryingIn !== null && (
                  <p className="text-xs text-muted-foreground">
                    Retrying in {retryingIn}s… (attempt {attempt + 1} of {MAX_RETRIES})
                  </p>
                )}
                <button
                  onClick={handleRetry}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Retry now
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