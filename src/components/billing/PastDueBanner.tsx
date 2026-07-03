import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UpdatePaymentMethodModal } from "./UpdatePaymentMethodModal";

/** Contextual banner shown only on billing-relevant surfaces (Settings, Upgrade). */
export function PastDueBanner() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ past_due_since: string | null; grace_days: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: prof }, { data: settings }] = await Promise.all([
        supabase.from("profiles").select("subscription_status, past_due_since").eq("user_id", user.id).maybeSingle(),
        supabase.from("billing_settings").select("grace_period_days").limit(1).maybeSingle(),
      ]);
      if ((prof as any)?.subscription_status === "past_due") {
        setState({
          past_due_since: (prof as any).past_due_since ?? null,
          grace_days: (settings as any)?.grace_period_days ?? 3,
        });
      }
    })();
  }, [user?.id]);

  if (!state) return null;

  const since = state.past_due_since ? new Date(state.past_due_since).getTime() : Date.now();
  const endsAt = new Date(since + state.grace_days * 86400 * 1000);
  const hoursLeft = Math.max(0, (endsAt.getTime() - Date.now()) / 3_600_000);
  const daysLeft = Math.max(1, Math.ceil(hoursLeft / 24));

  return (
    <>
      <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
        <div className="flex-1 text-sm">
          <div className="font-semibold">Your payment failed — update your card to keep Pro access.</div>
          <div className="text-muted-foreground text-xs mt-1">
            We'll keep retrying automatically. If we can't collect payment within {daysLeft} {daysLeft === 1 ? "day" : "days"}, your account will revert to Free.
          </div>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>Update card</Button>
      </div>
      <UpdatePaymentMethodModal
        open={open}
        onOpenChange={setOpen}
        hasOpenInvoice
        onSuccess={() => setState(null)}
      />
    </>
  );
}