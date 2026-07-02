import { useNavigate } from "react-router-dom";
import { Sparkles, Search, Star, MessageSquare, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * First-time logged-in empty state.
 * ONE screen, ONE flagship action — matches Vela's "Navigate every market" promise.
 */
export function FirstRunHero({
  firstName,
  onStartTour,
  onDismiss,
}: {
  firstName: string;
  onStartTour: () => void;
  onDismiss: () => void;
}) {
  const navigate = useNavigate();

  const openSearch = () =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));

  return (
    <section
      data-tour="first-run-hero"
      className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 sm:p-12 dark:bg-[hsl(var(--surface-glass))] dark:backdrop-blur-xl dark:border-[hsl(var(--border-glass))] dark:shadow-[var(--shadow-glass)]"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
      <button
        onClick={onDismiss}
        aria-label="Skip introduction"
        className="absolute top-4 right-4 z-10 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="relative max-w-2xl">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Welcome{firstName ? `, ${firstName}` : ""}
        </div>
        <h2 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-tight">
          Navigate every market — start with one ticker.
        </h2>
        <p className="mt-3 text-base text-muted-foreground">
          Vela turns any stock, ETF or index into a live briefing with AI signals, risk metrics
          and next steps. Search a symbol you follow and we&apos;ll build your first insight in seconds.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            onClick={openSearch}
            data-tour="hero-cta"
            className="h-12 px-6 text-base font-semibold shadow-lg shadow-primary/20"
          >
            <Search className="h-4 w-4" />
            Search a market
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button size="lg" variant="ghost" onClick={onStartTour} className="h-12 px-4 text-sm">
            Take the 30-second tour
          </Button>
        </div>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          {[
            { icon: Search, label: "1. Search a ticker", hint: "Try AAPL, SPY, ENI.MI" },
            { icon: Star, label: "2. Add to watchlist", hint: "Track it in one click" },
            { icon: MessageSquare, label: "3. Ask the AI Coach", hint: "Get a plain-English brief" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border/70 bg-background/60 p-3">
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <s.icon className="h-4 w-4 text-primary" /> {s.label}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{s.hint}</div>
            </div>
          ))}
        </div>

        <button
          onClick={() => navigate("/explore")}
          className="mt-5 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          Not sure where to start? Browse curated markets →
        </button>
      </div>
    </section>
  );
}

export default FirstRunHero;