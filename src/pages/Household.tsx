import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Target, PieChart, ShieldAlert, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type ClientRow = {
  clientId: string;
  displayName: string;
  goalsCount: number;
  totalTarget: number;
  holdingsCount: number;
  marketValue: number;
  riskProfile?: string | null;
};

export default function Household() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientRow[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // 1. consents granted to me
      const { data: consents } = await supabase
        .from("advisory_consents")
        .select("user_id, scope")
        .eq("granted_to", user.id)
        .is("revoked_at", null);
      const clientIds = Array.from(new Set((consents ?? []).map((c) => c.user_id)));
      if (clientIds.length === 0) {
        if (!cancelled) { setClients([]); setLoading(false); }
        return;
      }
      // 2. parallel aggregations
      const [profiles, goals, holdings, investorProfiles] = await Promise.all([
        supabase.from("profiles").select("user_id, display_name").in("user_id", clientIds),
        supabase.from("financial_goals").select("user_id, target").in("user_id", clientIds),
        supabase.from("portfolio_holdings").select("user_id, shares, avg_price").in("user_id", clientIds),
        supabase.from("investor_profiles").select("user_id, risk_profile").in("user_id", clientIds),
      ]);
      const rows: ClientRow[] = clientIds.map((cid) => {
        const prof = profiles.data?.find((p: any) => p.user_id === cid);
        const gs = (goals.data ?? []).filter((g: any) => g.user_id === cid);
        const hs = (holdings.data ?? []).filter((h: any) => h.user_id === cid);
        const inv = investorProfiles.data?.find((i: any) => i.user_id === cid);
        return {
          clientId: cid,
          displayName: prof?.display_name || cid.slice(0, 8),
          goalsCount: gs.length,
          totalTarget: gs.reduce((s: number, g: any) => s + Number(g.target || 0), 0),
          holdingsCount: hs.length,
          marketValue: hs.reduce((s: number, h: any) => s + Number(h.shares || 0) * Number(h.avg_price || 0), 0),
          riskProfile: inv?.risk_profile ?? null,
        };
      });
      if (!cancelled) { setClients(rows); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const totalAUM = clients.reduce((s, c) => s + c.marketValue, 0);
  const totalGoals = clients.reduce((s, c) => s + c.goalsCount, 0);
  const totalTarget = clients.reduce((s, c) => s + c.totalTarget, 0);

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Household View | Vela.ai" description="Advisor household aggregation: goals, holdings, risk" path="/household" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">Household view</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Aggregated, educational view of clients who granted you advisory access. Read-only. Not financial advice.
        </p>

        <div className="grid md:grid-cols-3 gap-4">
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide"><Users className="h-3 w-3" /> Clients</div>
            <div className="text-2xl font-bold mt-1">{clients.length}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide"><PieChart className="h-3 w-3" /> Aggregate market value</div>
            <div className="text-2xl font-bold mt-1">€{Math.round(totalAUM).toLocaleString()}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide"><Target className="h-3 w-3" /> Goals · total target</div>
            <div className="text-2xl font-bold mt-1">{totalGoals} · €{Math.round(totalTarget).toLocaleString()}</div>
          </CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Clients</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : clients.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6">No clients have granted you advisory access yet.</div>
            ) : (
              <div className="divide-y">
                {clients.map((c) => (
                  <div key={c.clientId} className="grid grid-cols-1 md:grid-cols-5 gap-3 py-3 text-sm items-center">
                    <div className="font-medium">{c.displayName}</div>
                    <div><Badge variant="outline" className="gap-1"><Target className="h-3 w-3" /> {c.goalsCount} goals</Badge></div>
                    <div className="text-muted-foreground">Target €{Math.round(c.totalTarget).toLocaleString()}</div>
                    <div className="text-muted-foreground">{c.holdingsCount} holdings · €{Math.round(c.marketValue).toLocaleString()}</div>
                    <div className="flex items-center gap-1 text-muted-foreground"><ShieldAlert className="h-3 w-3" /> {c.riskProfile ?? "—"}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}