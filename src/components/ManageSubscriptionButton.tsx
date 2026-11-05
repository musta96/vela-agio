import { useEffect, useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Loader2, ExternalLink, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { hidePurchaseUi } from "@/lib/native";

interface Props extends Omit<ButtonProps, "onClick"> {
  label?: string;
  /**
   * When true and the Stripe billing portal link is unavailable
   * (missing subscription / portal not configured / portal error),
   * cancel the active trial via the backend instead of redirecting.
   * Used from trial confirmation & billing screens to give users a
   * true one-click "Manage or cancel trial" affordance.
   */
  trialFallback?: boolean;
  onCanceled?: () => void;
}

export function ManageSubscriptionButton({ label = "Manage subscription", trialFallback = false, onCanceled, ...buttonProps }: Props) {
  const [loading, setLoading] = useState(false);
  const [hasSub, setHasSub] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Cheap pre-check so users without a subscription see a friendly CTA
  // instead of clicking and getting a "portal failed" toast.
  useEffect(() => {
    if (!user || hidePurchaseUi()) { setHasSub(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .eq("environment", getStripeEnvironment())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setHasSub(!!data);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const handleClick = async () => {
    if (hidePurchaseUi()) {
      navigate("/plans-billing");
      return;
    }
    // No subscription yet → send the user to the plans overview so they
    // can compare every tier, instead of dropping them straight into the
    // "Upgrade to Pro" flow with Pro preselected.
    if (hasSub === false) {
      navigate("/plans-billing");
      return;
    }
    setLoading(true);
    const cancelTrialFallback = async (reason: string) => {
      try {
        const { error } = await supabase.functions.invoke("cancel-trial");
        if (error) throw error;
        toast({
          title: "Trial canceled",
          description: "Billing portal was unavailable, so we canceled your trial directly. No charge was made.",
        });
        onCanceled?.();
      } catch (e) {
        toast({
          title: "Unable to manage subscription",
          description: `${reason} And we couldn't cancel automatically: ${(e as Error).message}`,
          variant: "destructive",
        });
      }
    };
    try {
      const { data, error } = await supabase.functions.invoke("create-portal-session", {
        body: {
          environment: getStripeEnvironment(),
          returnUrl: `${window.location.origin}/settings`,
        },
      });
      if ((data as any)?.noSubscription) {
        if (trialFallback) await cancelTrialFallback("No subscription found.");
        else navigate("/plans-billing");
        return;
      }
      if (error || !data?.url) {
        const msg = (data as any)?.error || error?.message || "";
        if (/no subscription/i.test(msg)) {
          if (trialFallback) await cancelTrialFallback("No subscription found.");
          else navigate("/plans-billing");
          return;
        }
        if (trialFallback) {
          await cancelTrialFallback(msg || "Billing portal was unavailable.");
          return;
        }
        throw new Error(msg || "Could not open billing portal");
      }
      window.open(data.url as string, "_blank", "noopener,noreferrer");
    } catch (e) {
      const msg = (e as Error).message;
      if (/no subscription/i.test(msg)) {
        if (trialFallback) await cancelTrialFallback("No subscription found.");
        else navigate("/plans-billing");
        return;
      }
      if (trialFallback) {
        await cancelTrialFallback(msg);
        return;
      }
      toast({
        title: "Unable to open billing portal",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const noSub = hasSub === false;
  return (
    <Button onClick={handleClick} disabled={loading} {...buttonProps}>
      {loading ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : noSub ? (
        <Sparkles className="h-4 w-4 mr-2" />
      ) : (
        <ExternalLink className="h-4 w-4 mr-2" />
      )}
      {noSub ? "See plans" : label}
    </Button>
  );
}