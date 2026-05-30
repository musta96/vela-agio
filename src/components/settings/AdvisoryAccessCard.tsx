import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface ConsentRow {
  id: string;
  granted_to: string;
  scope: string;
  mandate_ref: string | null;
  granted_at: string;
  revoked_at: string | null;
}

export function AdvisoryAccessCard() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ConsentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("advisory_consents")
      .select("id, granted_to, scope, mandate_ref, granted_at, revoked_at")
      .eq("user_id", user.id)
      .order("granted_at", { ascending: false });
    setRows((data ?? []) as ConsentRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  const revoke = async (id: string) => {
    const { error } = await supabase
      .from("advisory_consents")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error("Could not revoke", { description: error.message });
    else { toast.success("Advisory access revoked"); load(); }
  };

  const active = rows.filter((r) => !r.revoked_at);
  const history = rows.filter((r) => r.revoked_at);

  return (
    <Card className="p-6 rounded-2xl">
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-base font-semibold">Advisory access</h2>
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Admins of this platform can only see your portfolio or net worth if you have explicitly granted an
        advisory mandate. By default, no one but you can view your holdings.
      </p>

      {loading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : active.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No active mandates. Your data is private.
        </div>
      ) : (
        <ul className="space-y-2">
          {active.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="font-mono text-xs">{r.granted_to.slice(0, 8)}…</span>
                  <Badge variant="outline" className="text-[10px]">{r.scope}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Granted {format(new Date(r.granted_at), "d MMM yyyy")}
                  {r.mandate_ref ? ` · Mandate: ${r.mandate_ref}` : ""}
                </div>
              </div>
              <Button size="sm" variant="outline" className="text-destructive border-destructive/30" onClick={() => revoke(r.id)}>
                <ShieldOff className="h-4 w-4 mr-1.5" /> Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <details className="mt-4 text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">Revoked history ({history.length})</summary>
          <ul className="mt-2 space-y-1">
            {history.map((r) => (
              <li key={r.id}>
                <span className="font-mono">{r.granted_to.slice(0, 8)}…</span> · {r.scope} · revoked {format(new Date(r.revoked_at!), "d MMM yyyy")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}