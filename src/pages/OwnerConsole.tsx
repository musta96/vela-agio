import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SEO } from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { Users, Activity, ShieldCheck, Briefcase, Wallet, Crown } from "lucide-react";

interface UserRow {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  provider?: string;
  portfolios: number;
}
interface Stats {
  total: number; confirmed: number; signedInLast24h: number; signedInLast7d: number;
  newLast7d: number; portfolios: number; holdings: number; netWorthAccounts: number;
}

export default function OwnerConsole() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("owner-console");
      if (!error && data) {
        setStats(data.stats);
        setUsers(data.users);
        setAudit(data.recentAudit);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = users.filter((u) => !q || u.email?.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Owner Console — Vela.ai" description="Internal admin" path="/owner" />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Crown className="h-7 w-7 text-amber-400" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Owner Console</h1>
            <p className="text-sm text-muted-foreground">Founder-only view. Users, activity, payments and platform health.</p>
          </div>
          <Badge variant="outline" className="ml-auto border-amber-400/40 text-amber-400">Confidential</Badge>
        </div>

        {loading ? (
          <Card className="p-10 text-center text-muted-foreground">Loading…</Card>
        ) : !stats ? (
          <Card className="p-10 text-center text-destructive">Failed to load. Check edge function logs.</Card>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={<Users className="h-4 w-4" />} label="Total users" value={stats.total} sub={`${stats.confirmed} email-confirmed`} />
              <StatCard icon={<Activity className="h-4 w-4" />} label="Active 24h" value={stats.signedInLast24h} sub={`${stats.signedInLast7d} in last 7d`} />
              <StatCard icon={<ShieldCheck className="h-4 w-4" />} label="New (7d)" value={stats.newLast7d} sub="signups" />
              <StatCard icon={<Briefcase className="h-4 w-4" />} label="Portfolios" value={stats.portfolios} sub={`${stats.holdings} holdings`} />
            </div>

            <Tabs defaultValue="users">
              <TabsList>
                <TabsTrigger value="users">Users</TabsTrigger>
                <TabsTrigger value="audit">Audit log</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
              </TabsList>

              <TabsContent value="users" className="space-y-3 mt-4">
                <Input placeholder="Search by email…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead>Last sign-in</TableHead>
                        <TableHead>Confirmed</TableHead>
                        <TableHead className="text-right">Portfolios</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.email}</TableCell>
                          <TableCell><Badge variant="secondary" className="text-[10px]">{u.provider || "email"}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleString()}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "—"}</TableCell>
                          <TableCell>{u.email_confirmed_at ? <Badge className="bg-success/20 text-success">yes</Badge> : <Badge variant="outline">no</Badge>}</TableCell>
                          <TableCell className="text-right">{u.portfolios}</TableCell>
                        </TableRow>
                      ))}
                      {filtered.length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No users.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Card>
              </TabsContent>

              <TabsContent value="audit" className="mt-4">
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Who</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Entity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {audit.map((a, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs text-muted-foreground">{new Date(a.ts).toLocaleString()}</TableCell>
                          <TableCell>{a.actor_email || "—"}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{a.action}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{a.entity || "—"}</TableCell>
                        </TableRow>
                      ))}
                      {audit.length === 0 && (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No recent activity.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Card>
              </TabsContent>

              <TabsContent value="payments" className="mt-4">
                <Card className="p-10 text-center">
                  <Wallet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <h3 className="font-semibold mb-1">Payments not yet connected</h3>
                  <p className="text-sm text-muted-foreground">When Stripe is enabled, paid subscribers, MRR, churn and refunds will appear here.</p>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number | string; sub?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </Card>
  );
}