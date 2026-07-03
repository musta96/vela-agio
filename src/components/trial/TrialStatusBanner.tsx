import { useEffect, useState } from "react";
import { AlertCircle, PartyPopper, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

type Profile = {
  plan: string | null;
  trial_ends_at: string | null;
  billing_cycle: string | null;
  trial_welcome_shown_at: string | null;
};

export function TrialStatusBanner() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles")
      .select("plan, trial_ends_at, billing_cycle, trial_welcome_shown_at")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data as any));
  }, [user?.id]);

  if (!user || !profile) return null;

  // Welcome-to-Pro banner: shown once after conversion until acknowledged
  if (profile.plan === "pro" && profile.trial_welcome_shown_at === null && !welcomeDismissed) {
    return (
      <div className="mx-4 mt-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 flex items-center gap-3">
        <PartyPopper className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1 text-sm">
          <span className="font-semibold">Welcome to Vela Pro.</span>{" "}
          <span className="text-muted-foreground">Your trial converted successfully — every Pro feature is unlocked.</span>
        </div>
        <Button variant="ghost" size="sm" onClick={async () => {
          setWelcomeDismissed(true);
          await supabase.from("profiles").update({ trial_welcome_shown_at: new Date().toISOString() }).eq("user_id", user.id);
        }}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (profile.plan !== "pro_trial" || !profile.trial_ends_at || dismissed) return null;
  const endsAt = new Date(profile.trial_ends_at);
  const msLeft = endsAt.getTime() - Date.now();
  const hoursLeft = msLeft / 3_600_000;
  // Show inside T-2 window (≤ 60h left)
  if (hoursLeft > 60 || hoursLeft < 0) return null;

  const daysLeft = Math.max(1, Math.ceil(hoursLeft / 24));
  const amount = profile.billing_cycle === "annual" ? "€290" : "€29";
  const dateStr = endsAt.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="mx-4 mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-center gap-3">
      <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
      <div className="flex-1 text-sm">
        <span className="font-semibold">Your trial ends in {daysLeft} {daysLeft === 1 ? "day" : "days"}</span>
        <span className="text-muted-foreground"> — you'll be charged <strong>{amount}</strong> on <strong>{dateStr}</strong>.</span>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link to="/settings?tab=Billing&cancel=1">Manage trial</Link>
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}