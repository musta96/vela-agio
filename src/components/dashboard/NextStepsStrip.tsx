import { useState } from "react";
import { Link } from "react-router-dom";
import { X, ArrowRight, Briefcase, Bell, Repeat } from "lucide-react";

const KEY = "vela.nextSteps.dismissed";

const STEPS = [
  { to: "/portfolio", label: "Track a portfolio", icon: Briefcase },
  { to: "/alerts", label: "Set an alert", icon: Bell },
  { to: "/backtest", label: "Run a backtest", icon: Repeat },
];

export function NextStepsStrip() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
  });

  if (dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs">
      <span className="font-medium text-muted-foreground">Next:</span>
      {STEPS.map((s) => (
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