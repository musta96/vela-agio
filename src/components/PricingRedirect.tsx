import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Pricing from "@/pages/Pricing";

/**
 * Route guard for `/pricing`. Unauthenticated visitors (marketing traffic)
 * still see the public pricing page. Authenticated users are redirected
 * to `/upgrade`, which renders the in-app upgrade flow with their current
 * plan context — query params (e.g. `?plan=`, `?ref=`, `?freq=`) are
 * preserved so deep links keep working.
 */
export default function PricingRedirect() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) return <Pricing />;
  // Normalize marketing query params (?freq=yearly) into the upgrade flow's
  // ?cycle=annual|monthly shape so the correct billing cycle is preselected.
  const params = new URLSearchParams(location.search);
  const freq = params.get("freq");
  if (freq && !params.get("cycle")) {
    params.set("cycle", freq === "yearly" ? "annual" : "monthly");
    params.delete("freq");
  }
  const qs = params.toString();
  return <Navigate to={`/upgrade${qs ? `?${qs}` : ""}`} replace />;
}