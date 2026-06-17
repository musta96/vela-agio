import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Wraps a page that requires a connected broker. Renders the children
 * greyed-out and non-interactive, with a modal overlay pointing the user
 * to the broker-connection screen, until at least one broker account exists.
 */
export function BrokerRequiredOverlay({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "connected" | "missing">("loading");

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancel) setState("missing"); return; }
      const { count } = await supabase
        .from("broker_accounts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (cancel) return;
      setState((count ?? 0) > 0 ? "connected" : "missing");
    })();
    return () => { cancel = true; };
  }, []);

  if (state === "connected") return <>{children}</>;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-30 blur-[1px] grayscale" aria-hidden>
        {children}
      </div>
      <div className="absolute inset-0 flex items-start justify-center pt-24 px-4 z-10">
        <Card className="max-w-md w-full p-6 shadow-xl border-primary/30">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-lg">Connect a broker to continue</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            This area shows live broker orders and trade history. You need to link a brokerage account first - Vela.ai supports Interactive Brokers, Schwab, Robinhood, Questrade and 20+ more, read-only by default.
          </p>
          <div className="flex gap-2">
            <Button asChild className="flex-1 gap-1.5">
              <Link to="/settings?tab=connections"><Building2 className="h-4 w-4" /> Connect a broker</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/paper-trading">Try paper trading</Link>
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            You'll be asked to sign a short risk acknowledgement before connecting.
          </p>
        </Card>
      </div>
    </div>
  );
}