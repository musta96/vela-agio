import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Crown } from "lucide-react";
import { PLAN_LIST } from "@/lib/planFeatures";

export default function OwnerPricingOverview() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Pricing overview</h2>
        <p className="text-sm text-muted-foreground">The customer-facing plan hierarchy, prices and included capabilities in one view.</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-4">
        {PLAN_LIST.map((plan) => (
          <Card key={plan.slug} className={`relative p-5 ${plan.highlighted ? "border-primary shadow-sm" : ""}`}>
            {plan.highlighted && <Badge className="absolute -top-2 right-4 gap-1"><Crown className="h-3 w-3" /> Most popular</Badge>}
            <div className="flex items-center justify-between gap-2"><h3 className="text-lg font-semibold">{plan.name}</h3><Badge variant="outline" className="text-[10px]">{plan.slug}</Badge></div>
            <p className="mt-1 min-h-10 text-xs text-muted-foreground">{plan.audience}</p>
            <div className="mt-4"><span className="text-3xl font-bold tabular-nums">€{plan.priceMonthly}</span><span className="text-xs text-muted-foreground"> / month</span></div>
            {plan.priceAnnualTotal > 0 && <p className="mt-1 text-xs text-muted-foreground">€{plan.priceAnnualTotal} billed annually ({plan.priceAnnualMonthly}/month equivalent)</p>}
            <div className="my-4 border-t border-border" />
            <ul className="space-y-2 text-xs">
              {plan.featureList.map((feature) => <li key={feature} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /><span>{feature}</span></li>)}
            </ul>
            <div className="mt-5 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">{plan.features.advisor_seats ? `${plan.features.advisor_seats} advisor seats included` : "No advisor seats included"}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
