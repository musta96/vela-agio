import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import NotFound from "@/pages/NotFound";
import OwnerUnauthorized from "@/pages/OwnerUnauthorized";

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
  const [roles, setRoles] = useState<string[]>([]);
  const [rechecking, setRechecking] = useState(false);
  const activeRef = useRef(true);

  const runCheck = useCallback(async (opts?: { silent?: boolean }) => {
    if (!user) {
      setRoles([]);
      setAllowed(false);
      setChecking(false);
      return;
    }
    if (!opts?.silent) setRechecking(true);
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    if (!activeRef.current) return;
    const list = (data || []).map((r: any) => r.role as string);
    setRoles(list);
    setAllowed(list.some((r) => (PRIVILEGED_ROLES as readonly string[]).includes(r)));
    setChecking(false);
    setRechecking(false);
  }, [user]);

  // Initial + identity-change check.
  useEffect(() => {
    activeRef.current = true;
    setChecking(true);
    runCheck({ silent: true });
    return () => { activeRef.current = false; };
  }, [user, runCheck]);

  // Re-check on focus / visibility — covers role grants happening in another tab/session.
  useEffect(() => {
    if (!user) return;
    const onFocus = () => runCheck({ silent: true });
    const onVisible = () => { if (document.visibilityState === "visible") runCheck({ silent: true }); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, runCheck]);

  // Realtime: react instantly when an admin grants/revokes a role for this user.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`role-watch-${user.id}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${user.id}` },
        () => runCheck({ silent: true }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, runCheck]);

  // Safety net: poll while the user is on the unauthorized screen so a role grant
  // is picked up even if realtime/focus events were missed.
  useEffect(() => {
    if (!user || allowed || checking) return;
    const id = window.setInterval(() => runCheck({ silent: true }), 15000);
    return () => window.clearInterval(id);
  }, [user, allowed, checking, runCheck]);

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  // Unauthenticated visitors must NOT learn that the route exists — keep the 404.
  if (!user) return <NotFound />;
  // Authenticated but lacking privilege: show actionable screen with live re-check.
  if (!allowed) {
    return (
      <OwnerUnauthorized
        email={user.email ?? null}
        currentRoles={roles}
        onRecheck={() => runCheck()}
        rechecking={rechecking}
      />
    );
  }
  return <>{children}</>;
}