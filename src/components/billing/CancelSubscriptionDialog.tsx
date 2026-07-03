import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Gift, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { toast } from "sonner";

type Offer = { enabled: boolean; discount_type: "percentage" | "fixed"; discount_value: number; duration_months: number; copy: string } | null;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentPeriodEnd: string | null;
  onCanceled: () => void;
  onKept: () => void;
};

const REASONS: { id: string; label: string }[] = [
  { id: "too_expensive", label: "Too expensive" },
  { id: "missing_features", label: "Missing a feature I need" },
  { id: "unused", label: "Not using it enough" },
  { id: "switched_service", label: "Switching to another tool" },
  { id: "too_complex", label: "Too hard to use" },
  { id: "low_quality", label: "Quality wasn't what I expected" },
  { id: "other", label: "Something else" },
];

function formatOfferHeadline(o: Exclude<Offer, null>) {
  const disc = o.discount_type === "percentage"
    ? `${Number(o.discount_value)}% off`
    : `€${Number(o.discount_value).toFixed(0)} off`;
  return `${disc} for the next ${o.duration_months} ${o.duration_months === 1 ? "month" : "months"}`;
}

export function CancelSubscriptionDialog({ open, onOpenChange, currentPeriodEnd, onCanceled, onKept }: Props) {
  const [step, setStep] = useState<"offer" | "reason" | "confirm" | "working" | "done">("offer");
  const [offer, setOffer] = useState<Offer>(null);
  const [reason, setReason] = useState<string>("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [offerShown, setOfferShown] = useState(false);
  const [offerDeclined, setOfferDeclined] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason(""); setFeedback(""); setBusy(false); setStep("offer");
    setOfferShown(false); setOfferDeclined(false);
    (async () => {
      const { data } = await supabase.rpc("get_retention_offer");
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.enabled) {
        setOffer({
          enabled: true,
          discount_type: row.discount_type as any,
          discount_value: Number(row.discount_value),
          duration_months: Number(row.duration_months),
          copy: String(row.copy ?? ""),
        });
        setOfferShown(true);
        // Fire-and-forget audit of the offer impression.
        supabase.auth.getUser().then(({ data: u }) => {
          if (!u.user) return;
          void supabase.from("cancellation_feedback").insert({
            user_id: u.user.id,
            event_type: "retention_offer_shown",
            accepted_offer: false,
            metadata: {
              discount_type: row.discount_type,
              discount_value: Number(row.discount_value),
              duration_months: Number(row.duration_months),
            },
          });
        });
      } else {
        setOffer({ enabled: false, discount_type: "percentage", discount_value: 0, duration_months: 0, copy: "" });
        setStep("reason");
      }
    })();
  }, [open]);

  const endsAtText = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "the end of your current billing period";

  const acceptOffer = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("accept-retention-offer", {
        body: { environment: getStripeEnvironment() },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Could not apply offer");
      toast.success("Offer applied — your Pro plan continues at the discounted rate.");
      onKept();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not apply offer");
    } finally { setBusy(false); }
  };

  const doCancel = async () => {
    setStep("working"); setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-subscription", {
        body: {
          environment: getStripeEnvironment(),
          reason,
          feedback: feedback || null,
          offerShown,
          offerDeclined,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Cancellation failed");
      setStep("done");
      onCanceled();
    } catch (e: any) {
      toast.error(e?.message ?? "Cancellation failed");
      setStep("confirm");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        {step === "offer" && offer?.enabled && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Gift className="h-5 w-5 text-primary" /> Wait — an offer just for you</DialogTitle>
              <DialogDescription>Before you go, here's something we can do.</DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-2">
              <div className="text-lg font-semibold">{formatOfferHeadline(offer)}</div>
              <p className="text-sm text-muted-foreground whitespace-pre-line">{offer.copy}</p>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button className="flex-1" onClick={acceptOffer} disabled={busy}>
                {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Applying…</> : "Accept offer"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setStep("reason")} disabled={busy}>
                {/* Track that the user declined the retention offer */}
                No thanks, continue cancelling
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "reason" && (
          <>
            <DialogHeader>
              <DialogTitle>Quick question — why are you leaving?</DialogTitle>
              <DialogDescription>Optional. It helps us fix what's not working. Skip if you'd rather not say.</DialogDescription>
            </DialogHeader>
            <RadioGroup value={reason} onValueChange={setReason} className="space-y-2">
              {REASONS.map((r) => (
                <label key={r.id} className="flex items-center gap-2 rounded-md border border-border p-2.5 hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value={r.id} />
                  <span className="text-sm">{r.label}</span>
                </label>
              ))}
            </RadioGroup>
            {reason && (
              <div className="space-y-1">
                <Label htmlFor="feedback" className="text-xs">Anything more you want to add? (optional)</Label>
                <Textarea id="feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} maxLength={500} />
              </div>
            )}
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Never mind, keep my plan</Button>
              <Button variant="destructive" onClick={() => setStep("confirm")}>Continue</Button>
            </DialogFooter>
          </>
        )}

        {step === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" /> Confirm cancellation</DialogTitle>
              <DialogDescription>
                Your Pro access will remain active until <strong>{endsAtText}</strong>. On that date your plan changes to Free.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm space-y-2">
              <div className="font-semibold">What you'll lose on Free:</div>
              <ul className="list-disc pl-5 text-muted-foreground space-y-0.5 text-xs">
                <li>Unlimited AI questions and the Vela Advisor multi-strategy engine</li>
                <li>Full institutional research reports and PDF exports</li>
                <li>Portfolio stress-testing, Monte Carlo, VaR/CVaR and correlation tools</li>
                <li>Deep fundamental analysis, DCF models, and unlimited watchlists</li>
                <li>The daily market brief and premium alerts</li>
              </ul>
              <div className="text-xs text-muted-foreground pt-1">
                Your account, portfolios, and settings stay intact. You can resume Pro before <strong>{endsAtText}</strong> from this same page.
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setStep(offer?.enabled ? "offer" : "reason")}>Go back</Button>
              <Button variant="destructive" onClick={doCancel} disabled={busy}>Cancel my subscription</Button>
            </DialogFooter>
          </>
        )}

        {step === "working" && (
          <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Scheduling your cancellation…
          </div>
        )}

        {step === "done" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-500" /> Cancellation scheduled</DialogTitle>
              <DialogDescription>
                Your Pro access continues until <strong>{endsAtText}</strong>. A confirmation email is on its way. You can resume anytime before that date.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}