import { useEffect, useState } from "react";
import { OwnerPageHeader } from "@/components/owner/OwnerLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Search, Download } from "lucide-react";

type Row = { id: number; ts: string; actor_email: string | null; action: string; entity: string | null; entity_id: string | null; ip: string | null };

export default function OwnerAuditLog() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => { (async () => {
    const { data } = await supabase.from("audit_log")
      .select("id,ts,actor_email,action,entity,entity_id,ip")
      .order("ts", { ascending: false }).limit(200);
    setRows((data as Row[]) || []);
  })(); }, []);

  const filtered = rows.filter(r =>
    !q || r.action.toLowerCase().includes(q.toLowerCase())
    || (r.actor_email || "").toLowerCase().includes(q.toLowerCase())
    || (r.entity || "").toLowerCase().includes(q.toLowerCase())
  );

  function exportCsv() {
    const headers = ["timestamp","actor","action","entity","entity_id","ip"];
    const lines = [headers.join(",")].concat(filtered.map(r =>
      [r.ts, r.actor_email || "", r.action, r.entity || "", r.entity_id || "", r.ip || ""].map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")
    ));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `audit-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <OwnerPageHeader title="Audit log" subtitle="Immutable record of every privileged action."
        actions={<Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-2"/>Export</Button>} />
      <div className="relative max-w-md mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Filter by action, actor, entity…" value={q} onChange={e => setQ(e.target.value)} className="pl-9" />
      </div>
      <div className="bg-card border border-border rounded-2xl dark:bg-[hsl(var(--surface-glass))] dark:backdrop-blur-xl dark:border-[hsl(var(--border-glass))] dark:shadow-[var(--shadow-glass)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">When</th>
              <th className="text-left px-4 py-3 font-semibold">Actor</th>
              <th className="text-left px-4 py-3 font-semibold">Action</th>
              <th className="text-left px-4 py-3 font-semibold">Entity</th>
              <th className="text-left px-4 py-3 font-semibold">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(r => (
              <tr key={r.id} className="hover:bg-muted/20">
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{format(new Date(r.ts), "MMM d, HH:mm:ss")}</td>
                <td className="px-4 py-3">{r.actor_email || <span className="text-muted-foreground">system</span>}</td>
                <td className="px-4 py-3"><Badge variant="outline" className="font-mono text-[11px]">{r.action}</Badge></td>
                <td className="px-4 py-3 text-muted-foreground">{r.entity}{r.entity_id ? ` · ${r.entity_id.slice(0,8)}` : ""}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{r.ip || "—"}</td>
              </tr>
            ))}
            {!filtered.length && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">No audit entries.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}