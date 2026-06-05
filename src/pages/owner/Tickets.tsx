import { useEffect, useMemo, useState } from "react";
import { OwnerPageHeader } from "@/components/owner/OwnerLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LifeBuoy, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { listAllTickets, updateTicket, STATUS_LABEL, STATUS_TONE, type SupportTicket, type TicketStatus } from "@/lib/supportTickets";

const STATUS_OPTIONS: (TicketStatus | "all")[] = ["all", "open", "in_progress", "resolved", "closed"];

export default function OwnerTickets() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TicketStatus | "all">("open");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<SupportTicket | null>(null);
  const [reply, setReply] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setTickets(await listAllTickets()); }
    catch (e) { toast.error("Load failed", { description: (e as Error).message }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: tickets.length, open: 0, in_progress: 0, resolved: 0, closed: 0 };
    tickets.forEach(t => { c[t.status] = (c[t.status] ?? 0) + 1; });
    return c;
  }, [tickets]);

  const visible = tickets.filter(t => {
    if (filter !== "all" && t.status !== filter) return false;
    if (!q) return true;
    const hay = `${t.subject} ${t.message} ${t.user_email ?? ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const openTicket = (t: SupportTicket) => { setActive(t); setReply(t.admin_reply ?? ""); };

  const save = async (newStatus?: TicketStatus, resolve = false) => {
    if (!active) return;
    setSaving(true);
    try {
      await updateTicket(active.id, { status: newStatus, admin_reply: reply, resolve });
      toast.success(resolve ? "Marked resolved" : "Updated");
      setActive(null);
      await load();
    } catch (e) { toast.error("Update failed", { description: (e as Error).message }); }
    finally { setSaving(false); }
  };

  return (
    <>
      <OwnerPageHeader
        title="Support tickets"
        subtitle="User-submitted bugs, feature requests and feedback"
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        {STATUS_OPTIONS.map((s) => {
          const active = filter === s;
          const label = s === "all" ? "All" : STATUS_LABEL[s as TicketStatus];
          return (
            <button key={s} onClick={() => setFilter(s)}
              className={`rounded-2xl border p-3 text-left transition ${active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"}`}>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
              <div className="text-2xl font-semibold tabular-nums">{counts[s] ?? 0}</div>
            </button>
          );
        })}
      </div>

      <Card className="p-3 rounded-2xl mb-3 flex flex-wrap gap-2 items-center">
        <Input placeholder="Search subject, message or email…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
        <Badge variant="outline" className="text-[10px]">{visible.length} of {tickets.length}</Badge>
      </Card>

      <div className="space-y-2">
        {visible.map((t) => (
          <Card key={t.id} className="p-4 rounded-2xl cursor-pointer hover:border-primary/40 transition" onClick={() => openTicket(t)}>
            <div className="flex items-start gap-3">
              <LifeBuoy className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">{t.subject}</span>
                  <Badge variant="outline" className={`text-[10px] ${STATUS_TONE[t.status]}`}>{STATUS_LABEL[t.status]}</Badge>
                  <Badge variant="outline" className="text-[10px] capitalize">{t.category}</Badge>
                  <Badge variant="outline" className="text-[10px] capitalize">{t.severity}</Badge>
                  <Badge variant="outline" className="text-[10px] uppercase">{t.source}</Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{t.message}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {t.user_email ?? t.user_id.slice(0, 8)} · {new Date(t.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          </Card>
        ))}
        {!loading && visible.length === 0 && (
          <Card className="p-10 rounded-2xl text-center text-sm text-muted-foreground">No tickets match the current filter.</Card>
        )}
      </div>

      <Dialog open={!!active} onOpenChange={(v) => !v && setActive(null)}>
        <DialogContent className="sm:max-w-2xl">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {active.subject}
                  <Badge variant="outline" className={`text-[10px] ${STATUS_TONE[active.status]}`}>{STATUS_LABEL[active.status]}</Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="text-xs text-muted-foreground">
                  From <span className="font-mono">{active.user_email ?? active.user_id.slice(0, 8)}</span> · {new Date(active.created_at).toLocaleString()} · {active.source}
                  {active.page_url && <> · page <code className="font-mono">{active.page_url}</code></>}
                </div>
                <div className="rounded-lg border border-border bg-muted/40 p-3 whitespace-pre-wrap">{active.message}</div>
                <div>
                  <label className="text-xs font-medium">Reply to user (visible in their Settings → Support)</label>
                  <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} placeholder="Optional public reply" />
                </div>
                <div className="flex items-center gap-2">
                  <Select value={active.status} onValueChange={(v) => setActive({ ...active, status: v as TicketStatus })}>
                    <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setActive(null)} disabled={saving}>Close</Button>
                <Button variant="outline" onClick={() => save(active.status)} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                </Button>
                <Button onClick={() => save(undefined, true)} disabled={saving} className="gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Mark resolved
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}