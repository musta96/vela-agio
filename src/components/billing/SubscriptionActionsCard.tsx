import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CalendarClock, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getStripeEnvironment } from "@/lib/stripe";
import { CancelSubscriptionDialog } from "./CancelSubscriptionDialog";
import { toast } from "sonner";

type Sub = {
  status: string;
  cancel_at_period_end: boolean | null;
  current_period_end: string | null;
};

export function SubscriptionActionsCard() {
  const { user } = useAuth();
  const [sub, setSub] = useState<Sub | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("subscriptions")
      .select("status, cancel_at_period_end, current_period_end")
      .eq("user_id", user.id).eq("environment", getStripeEnvironment())
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    setSub(data as any);
    setLoading(false);
  };
  useEffect(() => { load(); }, [user?.id]);

  // Keep the card in sync with Stripe webhook writes: cancel_at_period_end
  // and status can change from the Stripe portal (or the payments-webhook
  // after any subscription.updated event) without the user leaving this page.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`sub-actions-${user.id}`)
      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` },
        () => { void load(); },
      )
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (loading) return null;
  const isActivePro = sub && ["active", "trialing", "past_due"].includes(sub.status);
  if (!isActivePro) return null;

  const endsAt = sub?.current_period_end ? new Date(sub.current_period_end) : null;
  const endsText = endsAt ? endsAt.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "the end of your current billing period";
  const scheduledCancel = Boolean(sub?.cancel_at_period_end);

  const undoCancel = async () => {
    setUndoing(true);
    try {
      const { data, error } = await supabase.functions.invoke("undo-cancellation", {
        body: { environment: getStripeEnvironment() },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Could not resume subscription");
      toast.success("Your subscription is back on. Nothing changes on your account.");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not resume subscription");
    } finally { setUndoing(false); }
  };

  return (
    <Card className="p-5 rounded-2xl space-y-3">
      {scheduledCancel ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
          <CalendarClock className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="flex-1 text-sm">
            <div className="font-semibold">Pro — ending {endsText}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              You'll keep full Pro access until then. After that, your plan will change to Free — your account and data stay put.
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={undoCancel} disabled={undoing} className="gap-1.5">
            {undoing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
            Resume subscription
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-sm">
            <div className="font-semibold">Cancel subscription</div>
            <div className="text-xs text-muted-foreground">Downgrade to Free at the end of your current billing period. Your account and data stay.</div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Cancel subscription</Button>
        </div>
      )}
      <CancelSubscriptionDialog
        open={open}
        onOpenChange={setOpen}
        currentPeriodEnd={sub?.current_period_end ?? null}
        onCanceled={load}
        onKept={load}
      />
    </Card>
  );
}