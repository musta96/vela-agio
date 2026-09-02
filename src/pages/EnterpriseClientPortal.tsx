import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import { TopNav } from "@/components/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Eye, Loader2, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { enterClientContext } from "@/lib/clientContext";
import { toast } from "sonner";

type Client = { id: string; name: string; scope: string | null; grantedAt: string };
export default function EnterpriseClientPortal() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: consents, error } = await supabase.from("advisory_consents").select("user_id,scope,granted_at").eq("granted_to", user.id).is("revoked_at", null);
      if (error) toast.error("Could not load client access");
      const ids = Array.from(new Set((consents ?? []).map((row: any) => row.user_id)));
      const { data: profiles } = ids.length ? await supabase.from("profiles").select("user_id,display_name").in("user_id", ids) : { data: [] as any[] };
      if (!cancelled) { setClients(ids.map((id) => { const consent = (consents ?? []).find((row: any) => row.user_id === id); const profile = (profiles ?? []).find((row: any) => row.user_id === id); return { id, name: profile?.display_name || id.slice(0, 8), scope: consent?.scope ?? null, grantedAt: consent?.granted_at ?? "" }; })); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);
  async function viewClient(client: Client) { if (!user) return; try { await enterClientContext({ actorId: user.id, clientId: client.id, displayName: client.name, role: "advisor_ro" }); toast.success(`Now viewing ${client.name} (read-only)`); } catch (e: any) { toast.error(e?.message ?? "Could not open client context"); } }
  return <div className="min-h-screen bg-background"><SEO title="Enterprise client portal | Vela.ai" description="Enterprise client portal for read-only advisory access" path="/enterprise/clients" /><TopNav /><main className="container mx-auto max-w-5xl space-y-6 px-6 py-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><Button asChild variant="ghost" size="sm" className="mb-2 gap-1"><Link to="/enterprise/dashboard"><ArrowLeft className="h-3.5 w-3.5" /> Firm dashboard</Link></Button><h1 className="text-3xl font-bold">Client portal</h1><p className="mt-1 text-sm text-muted-foreground">Read-only client access granted to your advisory account. Every context switch is audited.</p></div><div className="flex items-center gap-2"><Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" /> Read-only</Badge><Badge variant="outline" className="gap-1"><Users className="h-3 w-3" /> {clients.length} clients</Badge></div></div><Card className="p-5"><div className="space-y-3">{loading && <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading client access…</div>}{!loading && clients.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">No clients have granted this account advisory access yet.<div className="mt-3"><Button asChild variant="outline" size="sm"><Link to="/household">Open household view</Link></Button></div></div>}{clients.map((client) => <div key={client.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 py-3 last:border-0"><div><div className="font-medium">{client.name}</div><div className="text-xs text-muted-foreground">{client.scope || "Advisory access"}{client.grantedAt ? ` · granted ${new Date(client.grantedAt).toLocaleDateString()}` : ""}</div></div><Button size="sm" variant="outline" onClick={() => void viewClient(client)} className="gap-1.5"><Eye className="h-3.5 w-3.5" /> View read-only</Button></div>)}</div></Card></main></div>;
}
