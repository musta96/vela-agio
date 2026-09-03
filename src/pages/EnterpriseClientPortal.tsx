import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import { TopNav } from "@/components/TopNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Copy, Download, Eye, FileText, Loader2, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { enterClientContext } from "@/lib/clientContext";
import { toast } from "sonner";

type Client = { id: string; name: string; scope: string | null; grantedAt: string };
type LegalDoc = { id: string; kind: string; title: string; version: string; published_at: string | null };
type Memo = { id: string; title: string; storage_path: string; version: number; tickers: string[]; created_at: string };

export default function EnterpriseClientPortal() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [docs, setDocs] = useState<LegalDoc[]>([]);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [firmName, setFirmName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [consentsRes, legalRes, memoRes, teamRes] = await Promise.all([
      supabase.from("advisory_consents").select("user_id,scope,granted_at").eq("granted_to", user.id).is("revoked_at", null),
      supabase.from("legal_documents").select("id,kind,title,version,published_at").eq("status", "published").order("published_at", { ascending: false }),
      // RLS scopes these to the signed-in advisor's own generated reports.
      supabase.from("generated_memos").select("id,title,storage_path,version,tickers,created_at").order("created_at", { ascending: false }).limit(25),
      supabase.functions.invoke("manage-enterprise-team", { body: { action: "get_team" } }),
    ]);

    if (consentsRes.error) toast.error("Could not load client access");
    const consents = consentsRes.data ?? [];
    const ids = Array.from(new Set(consents.map((row: any) => row.user_id)));
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("user_id,display_name").in("user_id", ids)
      : { data: [] as any[] };

    setClients(ids.map((id) => {
      const consent = consents.find((row: any) => row.user_id === id);
      const profile = (profiles ?? []).find((row: any) => row.user_id === id);
      return { id, name: profile?.display_name || id.slice(0, 8), scope: consent?.scope ?? null, grantedAt: consent?.granted_at ?? "" };
    }));
    setDocs((legalRes.data ?? []) as LegalDoc[]);
    setMemos((memoRes.data ?? []) as Memo[]);
    setFirmName((teamRes.data as any)?.firm?.name ?? null);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  async function viewClient(client: Client) {
    if (!user) return;
    try {
      await enterClientContext({ actorId: user.id, clientId: client.id, displayName: client.name, role: "advisor_ro" });
      toast.success(`Now viewing ${client.name} (read-only)`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open client context");
    }
  }

  async function signedMemoUrl(memo: Memo) {
    const { data, error } = await supabase.storage.from("memos").createSignedUrl(memo.storage_path, 60 * 60 * 24);
    if (error || !data?.signedUrl) throw error ?? new Error("Could not create a share link");
    return data.signedUrl;
  }

  async function downloadMemo(memo: Memo) {
    setBusy(memo.id);
    try {
      const url = await signedMemoUrl(memo);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(firmName ?? "Vela").replace(/[^\w-]+/g, "_")}_${memo.title.replace(/[^\w-]+/g, "_")}_v${memo.version}.pdf`;
      a.click();
    } catch (e: any) {
      toast.error(e?.message ?? "Download failed");
    } finally { setBusy(null); }
  }

  async function shareMemo(memo: Memo) {
    setBusy(memo.id);
    try {
      const url = await signedMemoUrl(memo);
      await navigator.clipboard.writeText(url);
      toast.success("Client link copied", { description: "The link expires in 24 hours." });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create a client link");
    } finally { setBusy(null); }
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Enterprise client portal | Vela.ai" description="Enterprise client portal for read-only advisory access, compliance documents and white-label reports" path="/enterprise/clients" />
      <TopNav />
      <main className="container mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Button asChild variant="ghost" size="sm" className="mb-2 gap-1"><Link to="/enterprise/dashboard"><ArrowLeft className="h-3.5 w-3.5" /> Firm dashboard</Link></Button>
            <h1 className="text-3xl font-bold">Client portal</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {firmName ? `${firmName} · ` : ""}Read-only client access, compliance documents and reports you can send to clients. Every context switch is audited.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" /> Read-only</Badge>
            <Badge variant="outline" className="gap-1"><Users className="h-3 w-3" /> {clients.length} clients</Badge>
          </div>
        </div>

        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Clients</h2>
          <div className="space-y-3">
            {loading && <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading client access…</div>}
            {!loading && clients.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No clients have granted this account advisory access yet.
                <div className="mt-3"><Button asChild variant="outline" size="sm"><Link to="/household">Open household view</Link></Button></div>
              </div>
            )}
            {clients.map((client) => (
              <div key={client.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 py-3 last:border-0">
                <div>
                  <div className="font-medium">{client.name}</div>
                  <div className="text-xs text-muted-foreground">{client.scope || "Advisory access"}{client.grantedAt ? ` · granted ${new Date(client.grantedAt).toLocaleDateString()}` : ""}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => void viewClient(client)} className="gap-1.5"><Eye className="h-3.5 w-3.5" /> View read-only</Button>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-1 flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> Compliance documents</h2>
            <p className="mb-4 text-xs text-muted-foreground">Current published disclosures you can share with clients.</p>
            <div className="space-y-3">
              {!loading && docs.length === 0 && <p className="text-sm text-muted-foreground">No published compliance documents yet.</p>}
              {docs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{doc.title}</div>
                    <div className="text-xs text-muted-foreground">v{doc.version} · {doc.published_at ? new Date(doc.published_at).toLocaleDateString() : "Published"}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{doc.kind.replace(/_/g, " ")}</Badge>
                    <Button size="sm" variant="outline" asChild><Link to={`/legal/${doc.kind}`}>Open</Link></Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-1 flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-primary" /> Client reports</h2>
            <p className="mb-4 text-xs text-muted-foreground">Investment memos generated by this account{firmName ? `, delivered under ${firmName}` : ""}. Share links expire after 24 hours.</p>
            <div className="space-y-3">
              {loading && <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading reports…</div>}
              {!loading && memos.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  No reports yet. <Link to="/portfolio" className="text-primary hover:underline">Generate an investment memo</Link> to send to a client.
                </div>
              )}
              {memos.map((memo) => (
                <div key={memo.id} className="flex items-center justify-between gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{memo.title} <span className="text-xs text-muted-foreground">v{memo.version}</span></div>
                    <div className="text-xs text-muted-foreground">{new Date(memo.created_at).toLocaleDateString()} · {memo.tickers.length} instrument{memo.tickers.length === 1 ? "" : "s"}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => void downloadMemo(memo)} disabled={busy === memo.id} className="gap-1.5">
                      {busy === memo.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PDF
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void shareMemo(memo)} disabled={busy === memo.id} className="gap-1.5" title="Copy a 24-hour client link">
                      <Copy className="h-3.5 w-3.5" /> Link
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
