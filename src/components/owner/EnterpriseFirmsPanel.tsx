import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, RefreshCcw } from "lucide-react";

type FirmRow = {
  id: string;
  name: string;
  seat_limit: number;
  owner_user_id: string;
  owner_email: string | null;
  owner_plan: string;
  owner_status: string | null;
  members: number;
  pending_invites: number;
  created_at: string;
};

/**
 * Owner-console view of every Enterprise firm: which advisor owns it, the
 * plan they're actually paying for, and how many of their seats are used.
 * Seat mutations stay with the firm admin on /enterprise/team — this panel
 * is read-only oversight.
 */
export default function EnterpriseFirmsPanel() {
  const [rows, setRows] = useState<FirmRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("manage-enterprise-team", {
      body: { action: "admin_list_firms" },
    });
    setLoading(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Could not load firms.");
      return;
    }
    setRows(((data as any).firms ?? []) as FirmRow[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Enterprise teams</h2>
          <p className="text-sm text-muted-foreground">
            Every advisory firm on the platform, with the owner's own plan and seat usage.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Firm</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Owner plan</TableHead>
              <TableHead>Seats</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Loading…</TableCell></TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">No Enterprise firms yet.</TableCell></TableRow>
            )}
            {rows.map((f) => {
              const used = f.members + f.pending_invites;
              return (
                <TableRow key={f.id}>
                  <TableCell>
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      <Building2 className="h-3 w-3 text-muted-foreground" />{f.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{f.owner_email ?? f.owner_user_id.slice(0, 8)}</TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="text-[10px]">{f.owner_plan}</Badge>
                    {f.owner_status && <span className="ml-1.5 text-muted-foreground">{f.owner_status}</span>}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {used} / {f.seat_limit}
                    {f.pending_invites > 0 && (
                      <span className="text-muted-foreground"> ({f.pending_invites} pending)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(f.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
