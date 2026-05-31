import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff, Loader2, Plus, X } from "lucide-react";
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
  const [showForm, setShowForm] = useState(false);
  const [advisorId, setAdvisorId] = useState("");
  const [scope, setScope] = useState<"portfolio_read" | "net_worth_read" | "full">("portfolio_read");
  const [mandateRef, setMandateRef] = useState("");
  const [saving, setSaving] = useState(false);

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

  const grant = async () => {
    if (!user) return;
    const id = advisorId.trim();
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
      toast.error("Invalid advisor ID", { description: "Paste the UUID your advisor shared with you." });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("advisory_consents").insert({
      user_id: user.id,
      granted_to: id,
      scope,
      mandate_ref: mandateRef.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error("Could not grant access", { description: error.message });
      return;
    }
    toast.success("Mandate active", { description: "Your advisor can now view the agreed scope. Revoke any time." });
    setShowForm(false);
    setAdvisorId(""); setMandateRef(""); setScope("portfolio_read");
    load();
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
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground flex items-center justify-between gap-3">
          <span>No active mandates. Your data is private.</span>
          {!showForm && (
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Grant access
            </Button>
          )}
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

      {!showForm && active.length > 0 && (
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Grant another mandate
          </Button>
        </div>
      )}

      {showForm && (
        <div className="mt-4 rounded-lg border border-border p-4 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Grant advisory access</h3>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowForm(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Ask your advisor for their <strong>Vela advisor ID</strong> (a UUID they can copy from their
            Owner Console → Profile page) and the mandate reference your firm uses, then paste both below.
            You can revoke access at any time from this card.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Advisor ID (UUID)</Label>
              <Input
                value={advisorId}
                onChange={(e) => setAdvisorId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="portfolio_read">Portfolios (read)</SelectItem>
                  <SelectItem value="net_worth_read">Net worth (read)</SelectItem>
                  <SelectItem value="full">Full read access</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mandate reference (optional)</Label>
              <Input
                value={mandateRef}
                onChange={(e) => setMandateRef(e.target.value)}
                placeholder="e.g. MIFID-2026-0421"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" onClick={grant} disabled={saving || !advisorId}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Grant mandate
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            By granting access you authorise the named advisor to view the selected data under MiFID II
            Art. 25(2). Every advisor view is recorded in your audit log.
          </p>
        </div>
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