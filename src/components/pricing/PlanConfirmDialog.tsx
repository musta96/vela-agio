import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Check, Info } from "lucide-react";
import { PLAN_FEATURES, type PlanDefinition, type PlanSlug, normalizePlanSlug } from "@/lib/planFeatures";
import { useEntitlements } from "@/hooks/useEntitlements";
import { publicPlanDeltas } from "@/data/publicPlanCatalog";

export type PendingSelection = {
  plan: PlanDefinition;
  cadence: "monthly" | "annual";
  /** Resolved Stripe lookup key that will be sent to `create-checkout`. */
  priceId: string;
};

interface Props {
  selection: PendingSelection | null;
  onCancel: () => void;
  onConfirm: (selection: PendingSelection) => void;
}

/**
 * Confirmation step shown on `/pricing` after the user clicks a plan.
 * Summarises name, cadence, price, trial and the delta vs the current
 * plan before Stripe Embedded Checkout is opened.
 */
export function PlanConfirmDialog({ selection, onCancel, onConfirm }: Props) {
  const ent = useEntitlements();
  const open = !!selection;
  const currentSlug: PlanSlug = normalizePlanSlug(ent.planSlug ?? ent.tier);

  const plan = selection?.plan;
  const cadence = selection?.cadence ?? "monthly";
  const isAnnual = cadence === "annual";

  const price = plan
    ? isAnnual
      ? plan.priceAnnualTotal
      : plan.priceMonthly
    : 0;
  const effectiveMonthly = plan ? (isAnnual ? plan.priceAnnualMonthly : plan.priceMonthly) : 0;
  const monthlyOverYear = plan ? plan.priceMonthly * 12 : 0;
  const annualSavings = plan && isAnnual ? Math.max(0, monthlyOverYear - plan.priceAnnualTotal) : 0;

  const deltas = plan ? publicPlanDeltas(currentSlug, plan.slug) : [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md" data-testid="plan-confirm-dialog">
        <DialogHeader>
          <DialogTitle>Confirm your plan</DialogTitle>
          <DialogDescription>
            Review the details below. You'll enter payment on the next step — nothing is charged yet.
          </DialogDescription>
        </DialogHeader>

        {plan && (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 bg-muted/40">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Selected plan</div>
                  <div className="font-semibold text-base mt-0.5">Vela {plan.name}</div>
                </div>
                <Badge variant="secondary" className="capitalize">{isAnnual ? "Annual" : "Monthly"}</Badge>
              </div>

              <div className="mt-3 pt-3 border-t space-y-1.5 text-sm">
                <Row label={isAnnual ? "Billed today" : "Charged monthly"}>
                  <strong>€{price}</strong>
                  {isAnnual ? " / year" : " / month"}
                </Row>
                {isAnnual && (
                  <Row label="Effective monthly">
                    €{effectiveMonthly} / mo
                    {annualSavings > 0 && (
                      <span className="ml-2 text-primary text-xs font-semibold">Save €{annualSavings}/yr</span>
                    )}
                  </Row>
                )}
                <Row label="Trial">
                  <span className="text-muted-foreground">No trial — access starts immediately</span>
                </Row>
                <Row label="Stripe price">
                  <code className="text-[11px]" data-testid="confirm-price-id">{selection?.priceId}</code>
                </Row>
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <div className="text-xs font-semibold text-foreground mb-2">
                What changes vs {PLAN_FEATURES[currentSlug].name}
              </div>
              {deltas.length ? (
                <ul className="space-y-1.5 text-xs">
                  {deltas.map((d) => (
                    <li key={d} className="flex items-start gap-2">
                      <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 mt-0.5" />
                  <span>Same tier as your current plan — this will switch the billing cadence only.</span>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onCancel} data-testid="plan-confirm-back">Back</Button>
          <Button
            onClick={() => selection && onConfirm(selection)}
            className="gap-1.5"
            data-testid="plan-confirm-continue"
          >
            Continue to payment <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
