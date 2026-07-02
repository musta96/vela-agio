import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ArrowRight, ArrowLeft, Search, Star, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const TOUR_KEY = "vela_dashboard_tour_v1";

type Step = {
  target: string; // data-tour attribute value
  title: string;
  body: string;
  input: string; // the exact input the user needs
  icon: typeof Search;
  fallbackTarget?: string;
};

const STEPS: Step[] = [
  {
    target: "app-search",
    title: "1 · Find any market",
    body: "Every insight starts here. Type a ticker, ETF or company name.",
    input: "Try: AAPL · SPY · ENEL.MI",
    icon: Search,
    fallbackTarget: "hero-cta",
  },
  {
    target: "watchlist-card",
    title: "2 · Save what you watch",
    body: "Add symbols to your watchlist so Vela can score them daily and surface signals.",
    input: "Need: at least 1 ticker on your list",
    icon: Star,
    fallbackTarget: "first-run-hero",
  },
  {
    target: "ai-briefing",
    title: "3 · Ask for the brief",
    body: "The AI Coach turns your watchlist and holdings into a plain-English morning briefing.",
    input: "Need: 1+ holdings or watchlist items",
    icon: MessageSquare,
    fallbackTarget: "first-run-hero",
  },
];

function findEl(name: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${name}"]`);
}

export function hasSeenDashboardTour() {
  try {
    return localStorage.getItem(TOUR_KEY) === "1";
  } catch {
    return true;
  }
}

export function markDashboardTourSeen() {
  try {
    localStorage.setItem(TOUR_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * Read the server-side completion flag for the current user and mirror it into
 * localStorage. Returns true if the walkthrough has already been completed on
 * ANY device. Falls back gracefully to the local flag when offline.
 */
export async function loadDashboardTourState(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return hasSeenDashboardTour();
  try {
    const { data } = await supabase
      .from("profiles")
      .select("dashboard_tour_completed_at")
      .eq("user_id", userId)
      .maybeSingle();
    const done = !!(data as { dashboard_tour_completed_at?: string | null } | null)?.dashboard_tour_completed_at;
    if (done) markDashboardTourSeen();
    return done || hasSeenDashboardTour();
  } catch {
    return hasSeenDashboardTour();
  }
}

/** Persist completion for the signed-in user (per-account, cross-device). */
export async function persistDashboardTourSeen(userId: string | null | undefined) {
  markDashboardTourSeen();
  if (!userId) return;
  try {
    await supabase
      .from("profiles")
      .update({ dashboard_tour_completed_at: new Date().toISOString() })
      .eq("user_id", userId);
  } catch {
    /* offline / RLS — localStorage still holds the flag until we sync next time */
  }
}

export function DashboardTour({
  open,
  onClose,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  userId?: string | null;
}) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const nextBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const step = STEPS[i];

  // Reset to step 0 whenever the tour reopens so re-runs always start at Search.
  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  const finish = useCallback(() => {
    void persistDashboardTourSeen(userId ?? null);
    onClose();
  }, [onClose, userId]);

  const focusHighlighted = useCallback(() => {
    const el = findEl(step.target) ?? (step.fallbackTarget ? findEl(step.fallbackTarget) : null);
    if (!el) return;
    // Buttons/inputs are natively focusable; give cards a temporary tab index.
    if (!el.hasAttribute("tabindex") && !/^(a|button|input|select|textarea)$/i.test(el.tagName)) {
      el.setAttribute("tabindex", "-1");
    }
    el.focus({ preventScroll: false });
  }, [step]);

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = findEl(step.target) ?? (step.fallbackTarget ? findEl(step.fallbackTarget) : null);
      if (!el) {
        setRect(null);
        return;
      }
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      // Give scroll a beat, then measure.
      requestAnimationFrame(() => setRect(el.getBoundingClientRect()));
    };
    measure();
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((v) => Math.min(STEPS.length - 1, v + 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
      // Simple focus trap: Tab cycles within the tooltip.
      if (e.key === "Tab" && tipRef.current) {
        const focusables = tipRef.current.querySelectorAll<HTMLElement>(
          'button, [href], [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus management: capture the previously-focused element on open,
  // move focus into the dialog, and restore focus on close.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;
    // Wait a tick so the tooltip is mounted before focusing.
    const t = window.setTimeout(() => {
      nextBtnRef.current?.focus();
    }, 30);
    return () => {
      window.clearTimeout(t);
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  // Re-focus the primary action after each step change so keyboard users
  // always know where they are.
  useEffect(() => {
    if (!open) return;
    nextBtnRef.current?.focus();
  }, [i, open]);

  if (!open) return null;

  const pad = 8;
  const highlight = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  // Tooltip positioned below highlight if there's room, otherwise above.
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const tipW = Math.min(360, vw - 24);
  let tipTop = vh / 2 - 100;
  let tipLeft = vw / 2 - tipW / 2;
  if (highlight) {
    const below = highlight.top + highlight.height + 12;
    const above = highlight.top - 12 - 220;
    tipTop = below + 220 < vh ? below : Math.max(12, above);
    tipLeft = Math.min(vw - tipW - 12, Math.max(12, highlight.left));
  }

  const Icon = step.icon;
  const isLast = i === STEPS.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-label="Dashboard walkthrough">
      {/* Off-screen live region announces step changes to screen readers. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        Step {i + 1} of {STEPS.length}: {step.title}. {step.body}
      </div>
      {/* Dim + spotlight cutout via 4 rects */}
      {highlight ? (
        <>
          <div className="absolute bg-black/60" style={{ inset: 0, top: 0, height: highlight.top }} />
          <div
            className="absolute bg-black/60"
            style={{ top: highlight.top, left: 0, width: highlight.left, height: highlight.height }}
          />
          <div
            className="absolute bg-black/60"
            style={{
              top: highlight.top,
              left: highlight.left + highlight.width,
              right: 0,
              height: highlight.height,
            }}
          />
          <div
            className="absolute bg-black/60"
            style={{ top: highlight.top + highlight.height, left: 0, right: 0, bottom: 0 }}
          />
          <div
            className="absolute rounded-xl ring-2 ring-primary shadow-[0_0_0_9999px_rgba(0,0,0,0)] transition-all"
            style={highlight}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}

      <div
        ref={tipRef}
        className="absolute rounded-2xl border border-border bg-card text-card-foreground shadow-2xl p-5"
        style={{ top: tipTop, left: tipLeft, width: tipW }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-tour-title"
        aria-describedby="dashboard-tour-body"
        data-testid={`dashboard-tour-step-${i + 1}`}
        data-tour-step={step.target}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Icon className="h-4 w-4" />
            </div>
            <div id="dashboard-tour-title" className="text-sm font-semibold">{step.title}</div>
          </div>
          <button
            onClick={finish}
            aria-label="Close tour"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p id="dashboard-tour-body" className="mt-3 text-sm text-muted-foreground leading-relaxed">
          {step.body}
        </p>
        <div className="mt-3 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs font-medium text-foreground">
          {step.input}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 rounded-full transition-all ${idx === i ? "w-6 bg-primary" : "w-1.5 bg-muted"}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={focusHighlighted}
              aria-label={`Focus ${step.title}`}
              className="text-xs"
            >
              Try it
            </Button>
            {i > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setI((v) => v - 1)}>
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Button>
            )}
            {isLast ? (
              <Button ref={nextBtnRef} size="sm" onClick={finish}>
                Got it
              </Button>
            ) : (
              <Button ref={nextBtnRef} size="sm" onClick={() => setI((v) => v + 1)}>
                Next <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default DashboardTour;