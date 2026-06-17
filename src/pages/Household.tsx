import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Target, PieChart, ShieldAlert, Loader2, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { generateConsolidatedReport } from "@/lib/pdfReports";
import { logMandateEvent } from "@/lib/mandates";
import { enterClientContext } from "@/lib/clientContext";
import { Eye, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type ClientRow = {
  clientId: string;
  displayName: string;
  goalsCount: number;
  totalTarget: number;
  holdingsCount: number;
  marketValue: number;
  riskProfile?: string | null;
  suitabilityCompletedAt?: string | null;
  suitabilityDue: boolean;
  holdings: Array<{ symbol: string; value: number }>;
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
        supabase.from("portfolio_holdings").select("user_id, symbol, shares, avg_price").in("user_id", clientIds),
        supabase.from("investor_profiles").select("user_id, profile_name, completed_at").in("user_id", clientIds),
      ]);
      const rows: ClientRow[] = clientIds.map((cid) => {
        const prof = profiles.data?.find((p: any) => p.user_id === cid);
        const gs = (goals.data ?? []).filter((g: any) => g.user_id === cid);
        const hs = (holdings.data ?? []).filter((h: any) => h.user_id === cid);
        const inv = investorProfiles.data?.find((i: any) => i.user_id === cid);
        const completedAt = inv?.completed_at ?? null;
        const dueMs = 365 * 24 * 60 * 60 * 1000;
        const suitabilityDue =
          !completedAt || Date.now() - new Date(completedAt).getTime() > dueMs;
        return {
          clientId: cid,
          displayName: prof?.display_name || cid.slice(0, 8),
          goalsCount: gs.length,
          totalTarget: gs.reduce((s: number, g: any) => s + Number(g.target || 0), 0),
          holdingsCount: hs.length,
          marketValue: hs.reduce((s: number, h: any) => s + Number(h.shares || 0) * Number(h.avg_price || 0), 0),
          riskProfile: inv?.profile_name ?? null,
          suitabilityCompletedAt: completedAt,
          suitabilityDue,
          holdings: hs.map((h: any) => ({
            symbol: h.symbol ?? "-",
            value: Number(h.shares || 0) * Number(h.avg_price || 0),
          })),
        };
      });
      if (!cancelled) { setClients(rows); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const totalAUM = clients.reduce((s, c) => s + c.marketValue, 0);
  const totalGoals = clients.reduce((s, c) => s + c.goalsCount, 0);
  const totalTarget = clients.reduce((s, c) => s + c.totalTarget, 0);
  const dueList = clients.filter((c) => c.suitabilityDue);

  const enterContext = async (c: ClientRow) => {
    if (!user) return;
    try {
      await enterClientContext({
        actorId: user.id,
        clientId: c.clientId,
        displayName: c.displayName,
        role: "advisor_ro",
      });
      toast.success(`Now viewing ${c.displayName} (read-only)`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not switch context");
    }
  };

  const exportConsolidated = async () => {
    if (!user || !clients.length) return;
    try {
      generateConsolidatedReport({
        householdName: "Household",
        asOfDate: new Date().toISOString(),
        baseCurrency: "EUR",
        entities: clients.map((c) => ({
          label: c.displayName,
          holdings: c.holdings.map((h) => ({ symbol: h.symbol, value: h.value })),
        })),
      });
      // Audit one event per client included in the export.
      await Promise.all(
        clients.map((c) =>
          logMandateEvent({
            actorId: user.id,
            clientId: c.clientId,
            action: "export_pdf",
            metadata: { report: "consolidated" },
          }),
        ),
      );
      toast.success("Consolidated report generated");
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Household View | Vela.ai" description="Advisor household aggregation: goals, holdings, risk" path="/household" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">Household view</h1>
          </div>
          <Button onClick={exportConsolidated} disabled={!clients.length} className="gap-2">
            <FileDown className="h-4 w-4" /> Consolidated PDF
          </Button>
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
                  <div key={c.clientId} className="grid grid-cols-1 md:grid-cols-6 gap-3 py-3 text-sm items-center">
                    <div className="font-medium">{c.displayName}</div>
                    <div><Badge variant="outline" className="gap-1"><Target className="h-3 w-3" /> {c.goalsCount} goals</Badge></div>
                    <div className="text-muted-foreground">Target €{Math.round(c.totalTarget).toLocaleString()}</div>
                    <div className="text-muted-foreground">{c.holdingsCount} holdings · €{Math.round(c.marketValue).toLocaleString()}</div>
                    <div className="flex items-center gap-1 text-muted-foreground"><ShieldAlert className="h-3 w-3" /> {c.riskProfile ?? "-"}</div>
                    <div className="flex md:justify-end">
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => enterContext(c)}>
                        <Eye className="h-3.5 w-3.5" /> Switch in
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" /> Suitability reviews due
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground py-4">Loading…</div>
            ) : dueList.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4">All client suitability records are up to date.</div>
            ) : (
              <ul className="divide-y text-sm">
                {dueList.map((c) => (
                  <li key={c.clientId} className="py-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{c.displayName}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.suitabilityCompletedAt
                          ? `Last completed ${new Date(c.suitabilityCompletedAt).toLocaleDateString()}`
                          : "No suitability record on file"}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-amber-600 border-amber-500/40">Review due</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}