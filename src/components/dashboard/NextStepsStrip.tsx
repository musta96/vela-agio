import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X, ArrowRight, Eye, GitCompare, LineChart, Sparkles, Briefcase, Bell, Repeat } from "lucide-react";

const KEY = "vela.nextSteps.dismissed";
// 7 days
const AUTO_HIDE_MS = 7 * 24 * 60 * 60 * 1000;
const SEEN_AT_KEY = "vela.nextSteps.firstSeenAt";

type Chip = { to: string; label: string; icon: typeof Briefcase };

function genericChips(): { primary: { to: string; label: string; body: string }; chips: Chip[] } {
  return {
    primary: {
      to: "/portfolio",
      label: "Track your first holding",
      body: "See live P/L and Vela signals against your own positions.",
    },
    chips: [
      { to: "/watchlist", label: "Build a watchlist", icon: Eye },
      { to: "/backtest", label: "Run a backtest", icon: Repeat },
      { to: "/alerts", label: "Set an alert", icon: Bell },
    ],
  };
}

function contextualChips(symbol: string): { primary: { to: string; label: string; body: string }; chips: Chip[] } {
  const s = encodeURIComponent(symbol);
  return {
    primary: {
      to: `/watchlist?add=${s}`,
      label: `Add ${symbol} to a watchlist`,
      body: `Vela pings you when the signal on ${symbol} flips or a price target triggers.`,
    },
    chips: [
      { to: `/compare?symbols=${s}`, label: `Compare ${symbol} vs peers`, icon: GitCompare },
      { to: `/backtest?symbol=${s}`, label: `Backtest ${symbol}`, icon: LineChart },
      { to: `/stock/${s}`, label: `Get another signal`, icon: Sparkles },
    ],
  };
}

/**
 * ContextualNextStep — shown once after the first-run journey completes.
 * One primary suggestion + three quiet secondary chips.
 *
 * Dismissed permanently on: X click, primary CTA click, or after 7 days from
 * first render.
 */
export function NextStepsStrip({ symbol }: { symbol?: string | null } = {}) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
  });

  // Track first-render time to enforce the 7-day auto-hide.
  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_AT_KEY)) {
        localStorage.setItem(SEEN_AT_KEY, String(Date.now()));
      } else {
        const seenAt = Number(localStorage.getItem(SEEN_AT_KEY));
        if (Number.isFinite(seenAt) && Date.now() - seenAt > AUTO_HIDE_MS) {
          localStorage.setItem(KEY, "1");
          setDismissed(true);
        }
      }
    } catch { /* ignore */ }
  }, []);

  if (dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  };

  const { primary, chips } = symbol ? contextualChips(symbol) : genericChips();
  const heading = symbol ? `Next for ${symbol}` : "Next in Vela";
  const subheading = symbol
    ? "You've seen the signal — here's what usually comes next."
    : "One meaningful step at a time. Start with what matters most.";

  return (
    <section
      aria-label={symbol ? `Suggested next steps for ${symbol}` : "Suggested next steps"}
      className="relative rounded-2xl border border-border/60 bg-card/40 dark:bg-[hsl(var(--surface-glass))] dark:backdrop-blur-xl dark:border-[hsl(var(--border-glass))] p-4 sm:p-5"
    >
      <button
        onClick={dismiss}
        aria-label="Dismiss next steps"
        className="absolute top-3 right-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-baseline gap-2 pr-8">
        <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
        <span className="text-xs text-muted-foreground">{subheading}</span>
      </div>

      <Link
        to={primary.to}
        onClick={() => { try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ } }}
        className="group mt-3 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Sparkles className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{primary.label}</p>
          <p className="text-xs text-muted-foreground">{primary.body}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-primary opacity-70 group-hover:opacity-100 transition-opacity" />
      </Link>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="text-xs text-muted-foreground self-center mr-1">Also:</span>
        {chips.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="inline-flex items-center gap-1.5 rounded-md bg-background/60 border border-border/60 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <s.icon className="h-3.5 w-3.5" />
            {s.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

export const ContextualNextStep = NextStepsStrip;
export default NextStepsStrip;