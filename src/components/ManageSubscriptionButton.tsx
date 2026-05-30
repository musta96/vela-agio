import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { toast } from "@/hooks/use-toast";

interface Props extends Omit<ButtonProps, "onClick"> {
  label?: string;
}

export function ManageSubscriptionButton({ label = "Manage subscription", ...buttonProps }: Props) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-portal-session", {
        body: {
          environment: getStripeEnvironment(),
          returnUrl: `${window.location.origin}/settings`,
        },
      });
      if (error || !data?.url) throw new Error(error?.message || "Could not open billing portal");
      window.open(data.url as string, "_blank", "noopener,noreferrer");
    } catch (e) {
      const msg = (e as Error).message;
      toast({
        title: "Unable to open billing portal",
        description: msg.includes("No subscription") ? "You don't have an active subscription yet." : msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleClick} disabled={loading} {...buttonProps}>
      {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}
      {label}
    </Button>
  );
}