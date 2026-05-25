import { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePlatformControls } from "@/hooks/usePlatformControls";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

const OWNER_EMAIL = "mustarelli.edoardo@gmail.com";

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { isOn, controls, loading } = usePlatformControls();
  const [isAdmin, setIsAdmin] = useState(false);
  const [suspended, setSuspended] = useState<{ reason: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin");
      setIsAdmin((data?.length ?? 0) > 0 || (user.email || "").toLowerCase() === OWNER_EMAIL);
      const { data: s } = await supabase.from("user_suspensions").select("reason").eq("user_id", user.id).maybeSingle();
      if (s) setSuspended({ reason: (s as any).reason });
    })();
  }, [user]);

  if (loading) return <>{children}</>;

  if (suspended) {
    return (
      <FullScreen icon={<ShieldAlert className="h-10 w-10 text-destructive" />} title="Account suspended"
        body={suspended.reason || "Your account has been suspended. Contact support if you believe this is an error."} />
    );
  }

  if (isOn("maintenance_mode") && !isAdmin) {
    const reason = controls["maintenance_mode"]?.reason;
    return (
      <FullScreen icon={<ShieldAlert className="h-10 w-10 text-amber-400" />} title="Vela.ai is in maintenance"
        body={reason || "We're performing scheduled maintenance. The platform will be back online shortly."} />
    );
  }

  return <>{children}</>;
}

function FullScreen({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="flex justify-center">{icon}</div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}