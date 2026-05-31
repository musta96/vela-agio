import { useEffect, useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Loader2, ExternalLink, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface Props extends Omit<ButtonProps, "onClick"> {
  label?: string;
}

export function ManageSubscriptionButton({ label = "Manage subscription", ...buttonProps }: Props) {
  const [loading, setLoading] = useState(false);
  const [hasSub, setHasSub] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Cheap pre-check so users without a subscription see a friendly CTA
  // instead of clicking and getting a "portal failed" toast.
  useEffect(() => {
    if (!user) { setHasSub(false); return; }
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
    // No subscription yet → take the user to plans instead of failing.
    if (hasSub === false) {
      navigate("/pricing");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-portal-session", {
        body: {
          environment: getStripeEnvironment(),
          returnUrl: `${window.location.origin}/settings`,
        },
      });
      if (error || !data?.url) {
        const msg = error?.message || (data as any)?.error || "";
        if (/no subscription/i.test(msg)) {
          navigate("/pricing");
          return;
        }
        throw new Error(msg || "Could not open billing portal");
      }
      window.open(data.url as string, "_blank", "noopener,noreferrer");
    } catch (e) {
      const msg = (e as Error).message;
      if (/no subscription/i.test(msg)) {
        navigate("/pricing");
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