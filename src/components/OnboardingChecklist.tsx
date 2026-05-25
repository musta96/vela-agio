import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Check, ChevronDown, ChevronUp, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Step { key: string; title: string; description: string; done: boolean; cta: string; route: string }

export function OnboardingChecklist({ className }: { className?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [steps, setSteps] = useState<Step[]>([]);
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem("onboarding_collapsed") === "1");
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { localStorage.setItem("onboarding_collapsed", collapsed ? "1" : "0"); }, [collapsed]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [prof, suit, watch, holdings, prefs, factors] = await Promise.all([
        supabase.from("profiles").select("display_name, avatar_url, country_residence, onboarding_dismissed").eq("user_id", user.id).maybeSingle(),
        supabase.from("investor_profiles").select("id, completed_at").eq("user_id", user.id).maybeSingle(),
        supabase.from("watchlist_items").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("portfolio_holdings").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("alert_preferences").select("user_id").eq("user_id", user.id).maybeSingle(),
        supabase.auth.mfa.listFactors(),
      ]);

      const p: any = prof.data ?? {};
      const emailConfirmed = !!user.email_confirmed_at;
      const mfaEnabled = (factors.data?.totp ?? []).some((f: any) => f.status === "verified");

      const list: Step[] = [
        { key: "email", title: "Verify your email", description: "Confirm your address to unlock alerts and digests.", done: emailConfirmed, cta: "Resend email", route: "/security" },
        { key: "profile", title: "Complete your profile", description: "Display name, country and avatar.", done: !!(p.display_name && p.country_residence && p.avatar_url), cta: "Edit profile", route: "/profile" },
        { key: "suitability", title: "Investor questionnaire", description: "Set risk tolerance and horizon for personalised picks.", done: !!suit.data?.completed_at, cta: "Take it", route: "/suitability" },
        { key: "watchlist", title: "Add to watchlist", description: "Track at least one symbol you care about.", done: (watch.count ?? 0) > 0, cta: "Open watchlist", route: "/watchlist" },
        { key: "portfolio", title: "Add a holding", description: "Import or add a position to track P&L.", done: (holdings.count ?? 0) > 0, cta: "Open portfolio", route: "/portfolio" },
        { key: "alerts", title: "Enable notifications", description: "Choose email digest & immediate alerts.", done: !!prefs.data, cta: "Set up", route: "/alerts" },
        { key: "mfa", title: "Enable 2-factor auth", description: "Protect your account with an authenticator app.", done: mfaEnabled, cta: "Enable", route: "/security" },
      ];

      setSteps(list);
      setDismissed(!!p.onboarding_dismissed);
      setLoading(false);
    })();
  }, [user?.id]);

  const done = steps.filter((s) => s.done).length;
  const total = steps.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const dismiss = async () => {
    if (!user) return;
    setDismissed(true);
    await supabase.from("profiles").update({ onboarding_dismissed: true }).eq("user_id", user.id);
  };

  if (loading || dismissed || pct === 100) return null;

  return (
    <Card className={cn("border-primary/30 bg-gradient-to-br from-primary/5 to-transparent", className)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="rounded-md bg-primary/15 p-1.5"><Sparkles className="h-4 w-4 text-primary" /></div>
            <div className="min-w-0">
              <div className="text-sm font-semibold">Get the most out of Vela</div>
              <div className="text-xs text-muted-foreground">{done} of {total} steps complete</div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCollapsed((v) => !v)} aria-label={collapsed ? "Expand" : "Collapse"}>
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={dismiss} aria-label="Dismiss">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Progress value={pct} className="mt-3 h-1.5" />

        {!collapsed && (
          <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {steps.map((s) => (
              <li key={s.key} className={cn("flex items-start gap-3 rounded-md border border-border/60 bg-card/40 px-3 py-2.5", s.done && "opacity-60")}>
                <div className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", s.done ? "border-success bg-success/15 text-success" : "border-border bg-background")}>
                  {s.done && <Check className="h-3 w-3" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={cn("text-sm font-medium", s.done && "line-through")}>{s.title}</div>
                  <div className="text-xs text-muted-foreground">{s.description}</div>
                </div>
                {!s.done && (
                  <Button size="sm" variant="ghost" className="h-7 shrink-0 text-xs" onClick={() => navigate(s.route)}>{s.cta}</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default OnboardingChecklist;