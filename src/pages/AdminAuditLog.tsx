import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Activity, ShieldAlert, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TopNav } from "@/components/TopNav";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface AuditRow {
  id: number;
  ts: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  ip: string | null;
}

const AdminAuditLog = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin");
    const admin = (roleRows?.length ?? 0) > 0;
    setIsAdmin(admin);
    if (admin) {
      const { data } = await supabase
        .from("audit_log")
        .select("*")
        .order("ts", { ascending: false })
        .limit(200);
      setRows((data as AuditRow[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { if (user) load(); /* eslint-disable-next-line */ }, [user]);

  return (
    <div className="min-h-screen bg-background">
      <TopNav />

      <div className="container mx-auto px-6 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><ShieldAlert className="h-7 w-7 text-primary" /> Audit Log</h1>
            <p className="text-muted-foreground text-sm mt-1">Append-only record of security-sensitive events. Admin-only.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {isAdmin === false && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Admin only</AlertTitle>
            <AlertDescription>You do not have the <code>admin</code> role. Ask a workspace admin to grant access.</AlertDescription>
          </Alert>
        )}

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>Last {rows.length} events</CardTitle>
              <CardDescription>Newest first.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Payload</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(r.ts).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{r.actor_email ?? r.actor_id ?? "-"}</TableCell>
                      <TableCell><Badge variant="outline">{r.action}</Badge></TableCell>
                      <TableCell className="text-xs">{r.entity}{r.entity_id ? `/${r.entity_id}` : ""}</TableCell>
                      <TableCell className="text-xs font-mono max-w-md truncate">{r.payload ? JSON.stringify(r.payload) : "-"}</TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && !loading && (
                    <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">No events yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AdminAuditLog;