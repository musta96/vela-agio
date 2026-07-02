import { useState } from "react";
import { Link } from "react-router-dom";
import { X, ArrowRight, Briefcase, Bell, Repeat, Eye, GitCompare, LineChart } from "lucide-react";

const KEY = "vela.nextSteps.dismissed";

type StepLink = { to: string; label: string; icon: typeof Briefcase };

const GENERIC_STEPS: StepLink[] = [
  { to: "/portfolio", label: "Track a portfolio", icon: Briefcase },
  { to: "/alerts", label: "Set an alert", icon: Bell },
  { to: "/backtest", label: "Run a backtest", icon: Repeat },
];

function contextualSteps(symbol: string): StepLink[] {
  const s = encodeURIComponent(symbol);
  return [
    { to: `/watchlist?add=${s}`, label: `Watch ${symbol}`, icon: Eye },
    { to: `/compare?symbols=${s}`, label: `Compare ${symbol}`, icon: GitCompare },
    { to: `/backtest?symbol=${s}`, label: `Backtest ${symbol}`, icon: LineChart },
  ];
}

export function NextStepsStrip({ symbol }: { symbol?: string | null } = {}) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
  });

  if (dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  };

  const steps = symbol ? contextualSteps(symbol) : GENERIC_STEPS;
  const label = symbol ? `Next for ${symbol}:` : "Next:";

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs"
      aria-label={symbol ? `Suggested next steps for ${symbol}` : "Suggested next steps"}
    >
      <span className="font-medium text-muted-foreground">{label}</span>
      {steps.map((s) => (
        <Link
          key={s.to}
          to={s.to}
          className="inline-flex items-center gap-1.5 rounded-md bg-background px-2.5 py-1 font-medium text-foreground hover:bg-primary/10 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <s.icon className="h-3.5 w-3.5" />
          {s.label}
          <ArrowRight className="h-3 w-3 opacity-60" />
        </Link>
      ))}
      <button
        onClick={dismiss}
        aria-label="Dismiss next steps"
        className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default NextStepsStrip;