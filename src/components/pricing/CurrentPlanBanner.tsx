import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlements } from "@/hooks/useEntitlements";
import { getStripeEnvironment } from "@/lib/stripe";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CircleCheck, CalendarClock, TriangleAlert } from "lucide-react";
import { normalizePlanSlug, PLAN_FEATURES } from "@/lib/planFeatures";

type SubRow = {
  status: string | null;
  cancel_at_period_end: boolean | null;
  current_period_end: string | null;
  price_id: string | null;
};

/**
 * Shared "Your current plan" summary rendered on `/pricing` and every
 * upgrade modal. Reads from `useEntitlements` (tier + plan name) and joins
 * the latest `subscriptions` row for cadence + renewal date so the user
 * always sees what they're about to change from.
 */
export function CurrentPlanBanner({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const ent = useEntitlements();
  const [sub, setSub] = useState<SubRow | null>(null);

  useEffect(() => {
    if (!user) { setSub(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("status, cancel_at_period_end, current_period_end, price_id")
        .eq("user_id", user.id)
        .eq("environment", getStripeEnvironment())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setSub((data as SubRow) ?? null);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!user) return null;

  const slug = normalizePlanSlug(ent.planSlug ?? ent.tier);
  const def = PLAN_FEATURES[slug];
  const cadence = sub?.price_id?.includes("annual") || sub?.price_id?.includes("yearly")
    ? "Annual"
    : sub?.price_id
      ? "Monthly"
      : def.priceMonthly === 0 ? "Free" : null;
  const renewal = sub?.current_period_end ? new Date(sub.current_period_end) : null;
  const cancelling = !!sub?.cancel_at_period_end;

  return (
    <Card className={`p-4 ${compact ? "" : "sm:p-5"} border-primary/25 bg-primary/[0.04]`} data-testid="current-plan-banner">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Your current plan</div>
          <div className="mt-0.5 flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-base">{ent.planName ?? def.name}</span>
            <Badge variant="outline" className="capitalize">{slug}</Badge>
            {cadence && <Badge variant="secondary">{cadence}</Badge>}
            {cancelling && (
              <Badge variant="destructive" className="gap-1">
                <TriangleAlert className="h-3 w-3" /> Cancels at period end
              </Badge>
            )}
          </div>
          <div className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1.5">
            {renewal ? (
              <>
                <CalendarClock className="h-3.5 w-3.5" />
                {cancelling ? "Access ends" : "Renews"} {renewal.toLocaleDateString()}
              </>
            ) : (
              <>
                <CircleCheck className="h-3.5 w-3.5" />
                {def.audience}
              </>
            )}
          </div>
        </div>
        {!compact && (
          <Link
            to="/plans-billing"
            className="text-xs font-semibold text-primary hover:underline whitespace-nowrap"
            data-testid="current-plan-manage-link"
          >
            Manage billing →
          </Link>
        )}
      </div>
    </Card>
  );
}