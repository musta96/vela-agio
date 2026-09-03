import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

 type Lead = {
  id: string; first_name: string; last_name: string; email: string; role: string;
  firm_name: string | null; status: string; user_id: string | null; created_at: string;
  approved?: boolean; firm_id?: string | null;
};

export default function EnterpriseApprovalPanel() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("manage-enterprise-team", { body: { action: "admin_list_leads" } });
    setLoading(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Could not load Enterprise leads.");
      return;
    }
    setLeads(((data as any)?.leads ?? []) as Lead[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function approve(lead: Lead) {
    setBusy(lead.id);
    const { data, error } = await supabase.functions.invoke("manage-enterprise-team", {
      body: { action: "admin_approve_lead", lead_id: lead.id },
    });
    setBusy(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Approval failed.");
      return;
    }
    toast.success(`${lead.firm_name || "Firm"} approved for Enterprise`, {
      description: "Enterprise access and the included three seats are now active.",
    });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Enterprise approvals</h2>
          <p className="text-sm text-muted-foreground">Pending sales-assisted requests only — firms that pay for Enterprise are provisioned automatically.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
        </Button>
      </div>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Applicant</TableHead><TableHead>Firm</TableHead><TableHead>Received</TableHead><TableHead>Access</TableHead><TableHead className="text-right">Action</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading approvals…</TableCell></TableRow>}
            {!loading && leads.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Nothing awaiting review — every Enterprise request has been provisioned.</TableCell></TableRow>}
            {leads.map((lead) => {
              const approved = lead.approved || lead.status === "converted";
              return <TableRow key={lead.id}>
                <TableCell><div className="font-medium text-sm">{lead.first_name} {lead.last_name}</div><div className="text-xs text-muted-foreground">{lead.email}</div></TableCell>
                <TableCell><div className="text-sm">{lead.firm_name || "—"}</div><div className="text-xs text-muted-foreground">{lead.role}</div></TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(lead.created_at).toLocaleDateString()}</TableCell>
                <TableCell>{approved ? <Badge variant="outline" className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Active</Badge> : <Badge variant="outline">Pending review</Badge>}</TableCell>
                <TableCell className="text-right">{approved ? <Button size="sm" variant="ghost" asChild><a href="/owner/enterprise-teams"><ExternalLink className="mr-1 h-3.5 w-3.5" /> Firm profile</a></Button> : <Button size="sm" onClick={() => void approve(lead)} disabled={busy === lead.id || !lead.user_id} title={!lead.user_id ? "The applicant must have an account before approval can provision seats." : undefined}>{busy === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Approve & provision"}</Button>}</TableCell>
              </TableRow>;
            })}
          </TableBody>
        </Table>
      </Card>
      <p className="text-xs text-muted-foreground">Firms that complete Enterprise checkout are approved automatically once Stripe confirms payment, so they never appear here. Requests without a linked account remain reviewable but cannot receive seats until the applicant signs in or creates an account.</p>
    </div>
  );
}
