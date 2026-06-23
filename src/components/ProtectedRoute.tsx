import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import NotFound from "@/pages/NotFound";
import OwnerUnauthorized from "@/pages/OwnerUnauthorized";
import { toast } from "sonner";

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

  // Race-condition guards: only the most recent in-flight check is allowed to
  // commit state, and overlapping calls are coalesced.
  const reqIdRef = useRef(0);
  const inflightRef = useRef<Promise<void> | null>(null);
  const allowedRef = useRef(false);
  const firstCheckRef = useRef(true);
  const lastCheckAtRef = useRef(0);

  const runCheck = useCallback((opts?: { silent?: boolean; force?: boolean }): Promise<void> => {
    if (!user) {
      setRoles([]);
      setAllowed(false);
      allowedRef.current = false;
      setChecking(false);
      return Promise.resolve();
    }
    // Debounce: skip if a check ran < 2s ago, unless forced or explicit user click.
    const now = Date.now();
    if (!opts?.force && opts?.silent !== false && now - lastCheckAtRef.current < 2000 && inflightRef.current) {
      return inflightRef.current;
    }
    if (inflightRef.current && opts?.silent !== false) return inflightRef.current;
    if (!opts?.silent) setRechecking(true);
    const myId = ++reqIdRef.current;
    lastCheckAtRef.current = now;
    const p = (async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      // Drop stale responses — only the latest request can commit state.
      if (!activeRef.current || myId !== reqIdRef.current) return;
      if (error) {
        setRechecking(false);
        setChecking(false);
        return;
      }
      const list = (data || []).map((r: any) => r.role as string);
      const nextAllowed = list.some((r) => (PRIVILEGED_ROLES as readonly string[]).includes(r));
      const wasAllowed = allowedRef.current;
      allowedRef.current = nextAllowed;
      setRoles(list);
      setAllowed(nextAllowed);
      setChecking(false);
      setRechecking(false);
      // Notify only on the false → true transition, never on first mount.
      if (!firstCheckRef.current && !wasAllowed && nextAllowed) {
        toast.success("Owner Console access granted", {
          description: "Your roles were updated. Opening the console…",
        });
      }
      firstCheckRef.current = false;
    })().finally(() => {
      if (myId === reqIdRef.current) inflightRef.current = null;
    });
    inflightRef.current = p;
    return p;
  }, [user]);

  // Initial + identity-change check.
  useEffect(() => {
    activeRef.current = true;
    firstCheckRef.current = true;
    allowedRef.current = false;
    setChecking(true);
    runCheck({ silent: true, force: true });
    return () => { activeRef.current = false; };
  }, [user, runCheck]);

  // Re-check when the tab regains focus — debounced inside runCheck.
  useEffect(() => {
    if (!user) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") runCheck({ silent: true });
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, runCheck]);

  // Realtime: primary push channel for role grants/revocations on this user.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`role-watch-${user.id}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${user.id}` },
        () => runCheck({ silent: true, force: true }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, runCheck]);

  // Fallback poll: only while the user is on the unauthorized screen AND the
  // tab is visible. Replaces the previous always-on 15s interval.
  useEffect(() => {
    if (!user || allowed || checking) return;
    let id: number | null = null;
    const start = () => {
      if (id !== null) return;
      id = window.setInterval(() => runCheck({ silent: true }), 30000);
    };
    const stop = () => {
      if (id !== null) { window.clearInterval(id); id = null; }
    };
    const onVis = () => (document.visibilityState === "visible" ? start() : stop());
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
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