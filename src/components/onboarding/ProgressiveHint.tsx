import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { X, ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A small, dismissible in-context nudge. One-shot per `hintKey` — once dismissed
 * or its CTA is clicked, it never comes back for that user.
 *
 * Use for secondary-feature discovery AFTER the user has completed the core
 * first-run journey. Never stack more than one per screen.
 */
export function ProgressiveHint({
  hintKey,
  title,
  body,
  cta,
  when = true,
  className,
}: {
  hintKey: string;
  title: string;
  body?: ReactNode;
  cta?: { to?: string; onClick?: () => void; label: string };
  when?: boolean;
  className?: string;
}) {
  const storageKey = `vela.hint.${hintKey}`;
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(storageKey) === "1"; } catch { return false; }
  });

  // Re-sync if the hintKey changes (e.g. keyed off a symbol).
  useEffect(() => {
    try { setDismissed(localStorage.getItem(storageKey) === "1"); } catch { /* ignore */ }
  }, [storageKey]);

  if (!when || dismissed) return null;

  const persist = () => {
    try { localStorage.setItem(storageKey, "1"); } catch { /* ignore */ }
    setDismissed(true);
  };

  const handleCta = () => {
    cta?.onClick?.();
    persist();
  };

  return (
    <div
      role="note"
      className={cn(
        "relative flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3",
        className,
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground leading-tight">{title}</p>
        {body && <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>}
      </div>
      {cta && (cta.to ? (
        <Link
          to={cta.to}
          onClick={persist}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {cta.label} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : (
        <button
          type="button"
          onClick={handleCta}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {cta.label} <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ))}
      <button
        type="button"
        onClick={persist}
        aria-label="Dismiss"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default ProgressiveHint;