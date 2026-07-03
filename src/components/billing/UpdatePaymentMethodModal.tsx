import { useEffect, useMemo, useState } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If true, an unpaid open invoice exists — offer to retry immediately. */
  hasOpenInvoice?: boolean;
  onSuccess?: () => void;
};

export function UpdatePaymentMethodModal({ open, onOpenChange, hasOpenInvoice, onSuccess }: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [retryChoice, setRetryChoice] = useState(true);
  const [phase, setPhase] = useState<"card" | "finalizing" | "done" | "error">("card");
  const [result, setResult] = useState<{ card: any; retryResult?: any } | null>(null);

  useEffect(() => {
    if (!open) {
      setClientSecret(null); setSessionId(null); setError(""); setPhase("card"); setResult(null);
      return;
    }
    (async () => {
      setLoading(true); setError("");
      try {
        const returnUrl = `${window.location.origin}/settings/payment-method/return`;
        const { data, error: err } = await supabase.functions.invoke("update-payment-method", {
          body: { environment: getStripeEnvironment(), returnUrl },
        });
        if (err) throw err;
        if (!data?.clientSecret) throw new Error(data?.error ?? "Could not start card update");
        setClientSecret(data.clientSecret);
        // pull session_id out of clientSecret (format: cs_live_xxx_secret_xxx)
        const sid = String(data.clientSecret).split("_secret_")[0];
        setSessionId(sid);
      } catch (e: any) {
        setError(e?.message ?? "Could not start card update");
      } finally { setLoading(false); }
    })();
  }, [open]);

  const options = useMemo(() => {
    if (!clientSecret) return undefined;
    return {
      fetchClientSecret: async () => clientSecret,
      onComplete: async () => {
        setPhase("finalizing");
        try {
          const { data, error: err } = await supabase.functions.invoke("finalize-payment-method", {
            body: {
              sessionId,
              retryOpenInvoice: hasOpenInvoice && retryChoice,
              environment: getStripeEnvironment(),
            },
          });
          if (err) throw err;
          if (!data?.ok) throw new Error(data?.error ?? "Could not save card");
          setResult(data);
          setPhase("done");
          if (data.retryResult?.attempted) {
            if (data.retryResult.paid) toast.success("New card saved and outstanding payment charged successfully.");
            else toast.error("New card saved, but the retry charge did not succeed. We'll retry automatically.");
          } else {
            toast.success("Payment method updated.");
          }
          onSuccess?.();
        } catch (e: any) {
          setError(e?.message ?? "Could not save card");
          setPhase("error");
        }
      },
    };
  }, [clientSecret, sessionId, retryChoice, hasOpenInvoice, onSuccess]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Update payment method</DialogTitle>
          <DialogDescription>
            Enter your new card details below. No charge will be made
            {hasOpenInvoice ? " unless you choose to retry your outstanding payment." : "."}
          </DialogDescription>
        </DialogHeader>

        {hasOpenInvoice && phase === "card" && (
          <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <Checkbox checked={retryChoice} onCheckedChange={(v) => setRetryChoice(Boolean(v))} className="mt-0.5" />
            <span>
              <strong>Retry my outstanding payment</strong> with this new card. Recommended — this keeps your Pro access active immediately.
            </span>
          </label>
        )}

        {loading && (
          <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Starting secure card update…
          </div>
        )}
        {error && phase === "card" && (
          <div className="text-sm text-destructive">{error}</div>
        )}

        {clientSecret && phase === "card" && options && (
          <div className="rounded-md overflow-hidden border border-border">
            <EmbeddedCheckoutProvider stripe={getStripe()} options={options}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>
        )}

        {phase === "finalizing" && (
          <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Saving your new card…
          </div>
        )}

        {phase === "done" && result?.card && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm space-y-2">
            <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> New card saved</div>
            <div className="text-muted-foreground capitalize">
              {result.card.brand} •••• {result.card.last4} · expires {String(result.card.exp_month).padStart(2, "0")}/{String(result.card.exp_year).slice(-2)}
            </div>
            {result.retryResult?.attempted && (
              <div className={result.retryResult.paid ? "text-emerald-600" : "text-amber-600"}>
                {result.retryResult.paid ? "Outstanding payment charged successfully." : "Retry did not go through — we'll try again automatically."}
              </div>
            )}
            <Button size="sm" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        )}

        {phase === "error" && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm space-y-2">
            <div className="flex items-center gap-2 font-semibold"><XCircle className="h-4 w-4 text-destructive" /> Something went wrong</div>
            <div className="text-muted-foreground">{error}</div>
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}