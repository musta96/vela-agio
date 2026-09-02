import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import { TopNav } from "@/components/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, FileText, Loader2, RefreshCw, Users, ArrowRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type Member = { id: string; email: string | null; role: string; plan: string; subscription_status: string | null };
type Firm = { id: string; name: string; seat_limit: number; legal_name?: string | null; country?: string | null };
type LegalDoc = { id: string; kind: string; title: string; version: string; published_at: string | null };

export default function EnterpriseFirmDashboard() {
  const [firm, setFirm] = useState<Firm | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [docs, setDocs] = useState<LegalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const [{ data, error: teamError }, { data: legalDocs }] = await Promise.all([
      supabase.functions.invoke("manage-enterprise-team", { body: { action: "get_team" } }),
      supabase.from("legal_documents").select("id,kind,title,version,published_at").eq("status", "published").in("kind", ["risk_disclosure", "ai_disclosure", "terms", "privacy"]).order("published_at", { ascending: false }),
    ]);
    if (teamError || (data as any)?.error) { const message = (data as any)?.error ?? teamError?.message ?? "Could not load the firm workspace."; setError(message); toast.error(message); }
    setFirm((data as any)?.firm ?? null); setMembers(((data as any)?.members ?? []) as Member[]); setDocs((legalDocs ?? []) as LegalDoc[]); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const used = members.length;
  return <div className="min-h-screen bg-background"><SEO title="Enterprise firm dashboard | Vela.ai" description="Enterprise firm seats, usage and compliance workspace" path="/enterprise/dashboard" /><TopNav /><main className="container mx-auto space-y-6 px-6 py-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Building2 className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">{firm?.name || "Firm dashboard"}</h1></div><p className="mt-1 text-sm text-muted-foreground">Your team workspace for seats, client access and compliance documents.</p></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh</Button></div>
    {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading firm workspace…</div>}
    {!loading && error && <Card className="p-6"><h2 className="font-semibold">Firm workspace unavailable</h2><p className="mt-1 text-sm text-muted-foreground">{error}</p></Card>}
    {!loading && !error && !firm && <Card className="p-6"><h2 className="font-semibold">No Enterprise firm connected</h2><p className="mt-1 text-sm text-muted-foreground">Your administrator will make this workspace available after Enterprise approval.</p></Card>}
    {firm && <>
      <div className="grid gap-4 md:grid-cols-3"><Card className="p-5"><div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground"><Users className="h-3.5 w-3.5" /> Seats used</div><div className="mt-2 text-3xl font-bold">{used} <span className="text-base font-normal text-muted-foreground">/ {firm.seat_limit}</span></div><p className="mt-1 text-xs text-muted-foreground">Active team members</p></Card><Card className="p-5"><div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Compliance</div><div className="mt-2 text-3xl font-bold">{docs.length}</div><p className="mt-1 text-xs text-muted-foreground">Published documents available</p></Card><Card className="p-5 flex flex-col justify-between"><div><div className="text-xs uppercase tracking-wide text-muted-foreground">Client portal</div><p className="mt-2 text-sm">Review clients who have granted advisory access.</p></div><Button asChild size="sm" className="mt-4 w-fit gap-1.5"><Link to="/enterprise/clients">Open client portal <ArrowRight className="h-3.5 w-3.5" /></Link></Button></Card></div>
      <div className="grid gap-6 lg:grid-cols-2"><Card className="p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Team usage</h2><Button asChild variant="outline" size="sm"><Link to="/enterprise/team">Manage seats</Link></Button></div><div className="space-y-3">{members.map((member) => <div key={member.id} className="flex items-center justify-between gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0"><div><div className="text-sm font-medium">{member.email || "Team member"}</div><div className="text-xs capitalize text-muted-foreground">{member.role.replace("_", " ")}</div></div><Badge variant="outline" className="text-[10px]">{member.plan}</Badge></div>)}{members.length === 0 && <p className="text-sm text-muted-foreground">No active members yet.</p>}</div></Card><Card className="p-5"><div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-primary" /> Compliance documents</h2><Link to="/documents" className="text-xs text-primary hover:underline">All documents</Link></div><div className="space-y-3">{docs.slice(0, 6).map((doc) => <div key={doc.id} className="flex items-center justify-between gap-3"><div><div className="text-sm font-medium">{doc.title}</div><div className="text-xs text-muted-foreground">v{doc.version} · {doc.published_at ? new Date(doc.published_at).toLocaleDateString() : "Published"}</div></div><Badge variant="outline" className="text-[10px]">{doc.kind.replace("_", " ")}</Badge></div>)}{docs.length === 0 && <p className="text-sm text-muted-foreground">No published compliance documents yet.</p>}</div></Card></div>
    </>}
  </main></div>;
}
