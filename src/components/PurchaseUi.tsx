import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { hidePurchaseUi, isIosNative } from "@/lib/native";
import { AppleSubscriptionPanel } from "@/components/billing/AppleSubscriptionPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Info } from "lucide-react";

/**
 * Website checkout stays outside native shells. iOS uses Apple's localized
 * subscriptions; no reader-app exception is assumed.
 */
export function PurchaseUi({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  if (hidePurchaseUi()) return <>{fallback}</>;
  return <>{children}</>;
}

/** Neutral, non-purchase explanation shown in place of plan/pricing surfaces. */
export function ReaderModeNotice() {
  if (isIosNative()) return <AppleSubscriptionPanel />;
  return (
    <Card className="border-dashed">
      <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Your plan and its features are managed outside of the app. Sign in with the same account
          to use everything your plan already includes.
        </span>
      </CardContent>
    </Card>
  );
}

/** Route guard: purchase-only routes are unreachable in the native build. */
export function NoPurchaseRoute({ children, to = "/dashboard" }: { children: ReactNode; to?: string }) {
  if (isIosNative()) return <div className="mx-auto w-full max-w-xl p-4 sm:p-6"><AppleSubscriptionPanel /></div>;
  if (hidePurchaseUi()) return <Navigate to={to} replace />;
  return <>{children}</>;
}
