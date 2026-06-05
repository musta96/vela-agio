import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFlag } from "@/hooks/useFeatureFlags";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, Loader2 } from "lucide-react";

// Polls live_order_intents for pending rows belonging to the current user
// and surfaces a blocking confirm dialog. The Copilot's `propose_live_order`
// tool inserts these; the user must explicitly confirm or reject before
// anything hits the broker.
export function LiveOrderConfirmModal() {
  const { user } = useAuth();
  // Master kill-switch — until the operating entity is incorporated and
  // licensed, the modal never mounts and we never poll for intents.
  const liveTradingEnabled = useFlag("live_trading", false);
  const [intent, setIntent] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !liveTradingEnabled) return;
    let cancelled = false;
    const tick = async () => {
      const { data } = await supabase
        .from("live_order_intents")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
      if (!cancelled && data && data.length > 0) setIntent((prev: any) => prev?.id === data[0].id ? prev : data[0]);
    };
    tick();
    const id = setInterval(tick, 4000);
    const ch = supabase.channel("live_order_intents:" + user.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_order_intents", filter: `user_id=eq.${user.id}` }, tick)
      .subscribe();
    return () => { cancelled = true; clearInterval(id); supabase.removeChannel(ch); };
  }, [user, liveTradingEnabled]);

  const act = async (action: "confirm" | "reject") => {
    if (!intent) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("live-trade", { body: { intent_id: intent.id, action } });
      if (error) throw error;
      toast({ title: action === "confirm" ? "Order placed" : "Order rejected",
        description: data?.result?.error ?? (action === "confirm" ? `Status: ${data?.status}` : "No order sent to broker.") });
      setIntent(null);
    } catch (e: any) {
      toast({ title: "Failed", description: e.message ?? String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  if (!liveTradingEnabled || !intent) return null;

  return (
    <AlertDialog open onOpenChange={(o) => !o && !busy && setIntent(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Confirm LIVE order
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <Badge variant="destructive">LIVE</Badge>
                <Badge variant="outline">{String(intent.broker).toUpperCase()}</Badge>
                <Badge variant={intent.side === "buy" ? "default" : "secondary"}>{String(intent.side).toUpperCase()}</Badge>
              </div>
              <div className="text-base text-foreground font-mono">
                {intent.side?.toUpperCase()} {intent.qty} <span className="text-primary">{intent.symbol}</span> @ {intent.type === "limit" ? `LIMIT ${intent.limit_price}` : "MARKET"} · {intent.time_in_force?.toUpperCase()}
              </div>
              {intent.rationale && <div className="text-sm text-muted-foreground border-l-2 border-primary/40 pl-3">{intent.rationale}</div>}
              <div className="text-xs text-muted-foreground">This will send a real order to your broker using your stored API credentials. This is not financial advice.</div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={() => act("reject")}>Reject</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={() => act("confirm")} className="bg-destructive hover:bg-destructive/90">
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Confirm & place
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}