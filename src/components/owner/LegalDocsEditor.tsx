import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { FileText, Plus, ExternalLink, Trash2, Send } from "lucide-react";

type Doc = {
  id: string; kind: string; version: string; title: string; body: string;
  status: "draft" | "published" | "archived"; published_at: string | null;
  created_at: string; updated_at: string;
};

const KIND_OPTIONS = [
  { value: "terms", label: "Terms of Service" },
  { value: "privacy", label: "Privacy Policy" },
  { value: "risk_disclosure", label: "Risk Disclosure" },
  { value: "cookies", label: "Cookie Policy" },
  { value: "ai_disclosure", label: "AI Use Disclosure" },
];

export function LegalDocsEditor({ docs, reload }: { docs: Doc[]; reload: () => void }) {
  const [editing, setEditing] = useState<Doc | null>(null);
  const [creating, setCreating] = useState(false);

  const act = async (action: string, payload: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("owner-console", { body: { action, ...payload } });
    if (error || (data as any)?.error) { toast.error((data as any)?.error || error?.message || "Failed"); return false; }
    toast.success("Saved"); reload(); return true;
  };

  return (
    <div className="space-y-3">
      <Card className="p-4 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Legal documents</h3>
          <p className="text-xs text-muted-foreground">Drafts are private. Published versions are visible at <code className="font-mono">/legal/&lt;kind&gt;</code> and linked from the footer.</p>
        </div>
        <Button size="sm" onClick={() => { setCreating(true); setEditing({ id: "", kind: "terms", version: new Date().toISOString().slice(0,10), title: "Terms of Service", body: "", status: "draft", published_at: null, created_at: "", updated_at: "" }); }} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> New document</Button>
      </Card>

      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Kind</TableHead><TableHead>Title</TableHead><TableHead>Version</TableHead>
            <TableHead>Status</TableHead><TableHead>Updated</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {docs.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="text-xs"><Badge variant="outline" className="font-mono text-[10px]">{d.kind}</Badge></TableCell>
                <TableCell className="text-sm font-medium">{d.title}</TableCell>
                <TableCell className="text-xs font-mono">{d.version}</TableCell>
                <TableCell>
                  <Badge variant={d.status === "published" ? "secondary" : d.status === "archived" ? "outline" : "outline"} className={`text-[10px] ${d.status === "published" ? "bg-success/20 text-success" : ""}`}>{d.status}</Badge>
                </TableCell>
                <TableCell className="text-[10px] text-muted-foreground">{new Date(d.updated_at).toLocaleString()}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setEditing(d); }}>Edit</Button>
                  {d.status !== "published"
                    ? <Button size="sm" variant="outline" onClick={() => act("legal_publish", { id: d.id })}>Publish</Button>
                    : <Button size="sm" variant="ghost" onClick={() => act("legal_unpublish", { id: d.id })}>Unpublish</Button>}
                  {d.status === "published" && (
                    <Button size="sm" variant="ghost" asChild>
                      <a href={`/legal/${d.kind}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                    </Button>
                  )}
                  <NotifyDialog doc={d} onSend={(msg) => act("legal_notify_users", { version: d.version, message: msg })} />
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm(`Delete ${d.title} v${d.version}?`)) act("legal_delete", { id: d.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {docs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10 text-sm">No legal documents yet. Click <strong>New document</strong> to draft one.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>

      {editing && (
        <EditDialog
          doc={editing}
          isNew={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSave={async (payload) => {
            const ok = await act("legal_upsert", payload);
            if (ok) { setEditing(null); setCreating(false); }
          }}
        />
      )}
    </div>
  );
}

function EditDialog({ doc, isNew, onClose, onSave }: { doc: Doc; isNew: boolean; onClose: () => void; onSave: (p: Record<string, unknown>) => Promise<void> }) {
  const [kind, setKind] = useState(doc.kind);
  const [version, setVersion] = useState(doc.version);
  const [title, setTitle] = useState(doc.title);
  const [body, setBody] = useState(doc.body);
  const [status, setStatus] = useState(doc.status);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "New legal document" : `Edit — ${doc.title}`}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Kind</label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Version</label>
            <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2026-05-31" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Status</label>
            <Select value={status} onValueChange={(v) => setStatus(v as Doc["status"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Body (Markdown)</label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[320px] font-mono text-xs" placeholder="# Heading&#10;&#10;Plain markdown..." />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({ id: doc.id || undefined, kind, version, title, body, status })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NotifyDialog({ doc, onSend }: { doc: Doc; onSend: (msg: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState(`We've updated our ${doc.title} (v${doc.version}). Please review the latest version.`);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="gap-1"><Send className="h-3.5 w-3.5" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Notify all users</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Forces a re-consent prompt on next visit and drops an in-app notification to every user.</p>
        <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={async () => { await onSend(msg); setOpen(false); }}>Send</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}