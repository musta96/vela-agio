import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import NotFound from "@/pages/NotFound";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

// Privileged roles authorised to access /owner and /admin surfaces.
// MFA enforcement still required on top of this - see edge function / Settings.
export const PRIVILEGED_ROLES = ["admin", "support", "compliance", "engineer"] as const;
export type PrivilegedRole = typeof PRIVILEGED_ROLES[number];

export function OwnerRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user) { setChecking(false); setAllowed(false); return; }
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", PRIVILEGED_ROLES as unknown as any);
      if (!active) return;
      setAllowed(!!(data && data.length));
      setChecking(false);
    })();
    return () => { active = false; };
  }, [user]);

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  // Never reveal that the route exists to non-privileged or unauthenticated visitors.
  if (!user || !allowed) return <NotFound />;
  return <>{children}</>;
}