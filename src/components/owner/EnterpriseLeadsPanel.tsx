import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowUpRight, Building2, Mail, Users, RefreshCcw, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Lead = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  company: string | null;
  firm_name: string | null;
  num_clients: number | null;
  team_size: string | null;
  message: string | null;
  source: string | null;
  status: string;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
};

const STATUSES = [
  { value: "new", label: "New", tone: "warn" },
  { value: "contacted", label: "Contacted", tone: "info" },
  { value: "converted", label: "Converted", tone: "ok" },
  { value: "not_a_fit", label: "Not a fit", tone: "muted" },
] as const;

const STATUS_LABEL = (s: string) =>
  STATUSES.find((x) => x.value === s)?.label ?? s;

const STATUS_BADGE = (s: string) => {
  const t = STATUSES.find((x) => x.value === s)?.tone;
  switch (t) {
    case "warn":
      return "border-amber-500/40 text-amber-600 bg-amber-500/10";
    case "info":
      return "border-primary/40 text-primary bg-primary/10";
    case "ok":
      return "border-emerald-500/40 text-emerald-600 bg-emerald-500/10";
    default:
      return "border-border text-muted-foreground bg-muted";
  }
};

export default function EnterpriseLeadsPanel() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Lead | null>(null);
  const [draftStatus, setDraftStatus] = useState<string>("new");
  const [draftNotes, setDraftNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("enterprise_leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setLoading(false);
    if (error) {
      toast.error("Could not load enterprise leads", { description: error.message });
      return;
    }
    setLeads((data ?? []) as Lead[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (filter !== "all" && l.status !== filter) return false;
      if (!q.trim()) return true;
      const hay = `${l.first_name} ${l.last_name} ${l.email} ${l.firm_name ?? l.company ?? ""} ${l.message ?? ""}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [leads, filter, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: leads.length };
    for (const s of STATUSES) c[s.value] = leads.filter((l) => l.status === s.value).length;
    return c;
  }, [leads]);

  const openDetail = (l: Lead) => {
    setActive(l);
    setDraftStatus(l.status);
    setDraftNotes(l.internal_notes ?? "");
  };

  const save = async () => {
    if (!active) return;
    setSaving(true);
    const { error } = await supabase
      .from("enterprise_leads")
      .update({ status: draftStatus, internal_notes: draftNotes || null })
      .eq("id", active.id);
    setSaving(false);
    if (error) {
      toast.error("Save failed", { description: error.message });
      return;
    }
    toast.success("Lead updated");
    setLeads((prev) => prev.map((l) => (l.id === active.id ? { ...l, status: draftStatus, internal_notes: draftNotes || null } : l)));
    setActive((a) => (a ? { ...a, status: draftStatus, internal_notes: draftNotes || null } : a));
  };

  const openUserOverride = (lead: Lead) => {
    // Jump directly into the Users panel scoped to this lead's email.
    navigate(`/owner/users?email=${encodeURIComponent(lead.email)}`);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Enterprise leads</h2>
          <p className="text-sm text-muted-foreground">
            Sales-assisted intake — Enterprise activation is always manual.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", ...STATUSES.map((s) => s.value)] as string[]).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`text-xs px-2.5 py-1 rounded-md border transition ${
              filter === k ? "bg-primary/10 border-primary text-primary" : "bg-muted/30 border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {k === "all" ? "All" : STATUS_LABEL(k)}{" "}
            <span className="opacity-60">({counts[k] ?? 0})</span>
          </button>
        ))}
        <Input
          placeholder="Search name, email, firm…"
          className="ml-auto w-64 h-8 text-xs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contact</TableHead>
              <TableHead>Firm</TableHead>
              <TableHead>Clients</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Received</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">Loading…</TableCell></TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">No leads match.</TableCell></TableRow>
            )}
            {filtered.map((l) => (
              <TableRow key={l.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openDetail(l)}>
                <TableCell>
                  <div className="font-medium text-sm">{l.first_name} {l.last_name}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />{l.email}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm flex items-center gap-1.5"><Building2 className="h-3 w-3 text-muted-foreground" />{l.firm_name || l.company || "—"}</div>
                  <div className="text-[11px] text-muted-foreground">{l.role}</div>
                </TableCell>
                <TableCell className="text-sm">
                  {l.num_clients != null ? (
                    <span className="inline-flex items-center gap-1"><Users className="h-3 w-3 text-muted-foreground" />{l.num_clients.toLocaleString()}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[240px]">
                  <div className="text-xs text-muted-foreground line-clamp-2">{l.message || "—"}</div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{format(new Date(l.created_at), "d MMM yy, HH:mm")}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={STATUS_BADGE(l.status)}>{STATUS_LABEL(l.status)}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openDetail(l); }}>
                    Open <ArrowUpRight className="h-3 w-3 ml-1" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Enterprise lead — {active?.first_name} {active?.last_name}</DialogTitle>
          </DialogHeader>
          {active && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Kv label="Email" value={<a href={`mailto:${active.email}`} className="text-primary hover:underline">{active.email}</a>} />
                <Kv label="Role" value={active.role} />
                <Kv label="Firm" value={active.firm_name || active.company || "—"} />
                <Kv label="Approx. clients" value={active.num_clients != null ? active.num_clients.toLocaleString() : "—"} />
                <Kv label="Team size" value={active.team_size || "—"} />
                <Kv label="Source" value={active.source || "—"} />
                <Kv label="Submitted" value={format(new Date(active.created_at), "d MMM yyyy, HH:mm")} />
                <Kv label="User ID" value={active.user_id ? <code className="text-[11px]">{active.user_id.slice(0, 8)}</code> : <span className="text-muted-foreground">Anonymous</span>} />
              </div>

              {active.message && (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap">{active.message}</div>
              )}

              <div className="grid grid-cols-[140px_1fr] gap-3 items-center">
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <Select value={draftStatus} onValueChange={setDraftStatus}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Internal notes</label>
                <Textarea
                  rows={4}
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  placeholder="Meeting notes, next steps, quoted pricing…"
                  className="mt-1 text-sm"
                />
              </div>

              {draftStatus === "converted" && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-emerald-700">Ready to activate as Enterprise</div>
                    <div className="text-muted-foreground mt-0.5">
                      Save this status, then jump into the user override tool to grant Enterprise access manually.
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openUserOverride(active)} className="shrink-0">
                    Open user override <ArrowUpRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActive(null)}>Close</Button>
            <Button onClick={save} disabled={saving}>
              <Save className="h-3.5 w-3.5 mr-1.5" />{saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kv({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className="text-sm mt-0.5">{value}</div>
    </div>
  );
}