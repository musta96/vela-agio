import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "vela_profile_setup_banner_dismissed_v1";

/**
 * Compact, dismissible dashboard banner that nudges users to finish setting up
 * their profile without dominating the home. The full step-by-step checklist
 * lives on the Profile page (/profile#getting-started).
 */
export function ProfileSetupBanner({ className }: { className?: string }) {
  const { user } = useAuth();
  const [pct, setPct] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [prof, suit, watch, holdings, prefs, factors] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, avatar_url, country_residence, onboarding_dismissed")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.from("investor_profiles").select("id, completed_at").eq("user_id", user.id).maybeSingle(),
        supabase.from("watchlist_items").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("portfolio_holdings").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("alert_preferences").select("user_id").eq("user_id", user.id).maybeSingle(),
        supabase.auth.mfa.listFactors(),
      ]);
      if (cancelled) return;
      const p: any = prof.data ?? {};
      const emailConfirmed = !!user.email_confirmed_at;
      const mfaEnabled = (factors.data?.totp ?? []).some((f: any) => f.status === "verified");
      const done = [
        emailConfirmed,
        !!(p.display_name && p.country_residence && p.avatar_url),
        !!suit.data?.completed_at,
        (watch.count ?? 0) > 0,
        (holdings.count ?? 0) > 0,
        !!prefs.data,
        mfaEnabled,
      ].filter(Boolean).length;
      setPct(Math.round((done / 7) * 100));
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  };

  if (!user || dismissed || pct === null || pct === 100) return null;

  return (
    <div
      role="status"
      data-testid="profile-setup-banner"
      className={cn(
        "flex items-start sm:items-center gap-2 sm:gap-3 rounded-xl border border-border bg-card px-3 py-2 sm:px-3.5 sm:py-2.5 text-xs sm:text-sm",
        "dark:bg-[hsl(var(--surface-glass))] dark:border-[hsl(var(--border-glass))]",
        className,
      )}
    >
      <span className="mt-0.5 sm:mt-0 grid h-6 w-6 sm:h-7 sm:w-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
      </span>
      <div className="min-w-0 flex-1 leading-snug">
        <Link
          to="/profile#getting-started"
          className="text-foreground font-medium hover:underline inline-flex items-center gap-1"
        >
          Finish setting up your profile
          <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
        </Link>
        <span className="ml-1.5 sm:ml-2 text-[11px] sm:text-xs text-muted-foreground tabular-nums">{pct}% complete</span>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="mt-0.5 sm:mt-0 -mr-1 text-muted-foreground hover:text-foreground rounded-md p-1"
      >
        <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
      </button>
    </div>
  );
}

export default ProfileSetupBanner;