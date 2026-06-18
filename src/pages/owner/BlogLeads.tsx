import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Search, Users } from "lucide-react";
import { toast } from "sonner";

interface LeadRow {
  id: string;
  post_id: string | null;
  post_title: string | null;
  post_slug: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  role: string | null;
  country: string | null;
  consent: boolean;
  kind: "gate" | "lead_magnet";
  source: string | null;
  created_at: string;
}

export default function BlogLeads() {
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "gate" | "lead_magnet">("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("admin_list_blog_leads" as any);
      if (error) { toast.error(error.message); setLoading(false); return; }
      setRows(((data as any) || []) as LeadRow[]);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (!needle) return true;
      return (
        r.email.toLowerCase().includes(needle) ||
        (r.post_title || "").toLowerCase().includes(needle) ||
        (r.company || "").toLowerCase().includes(needle) ||
        (`${r.first_name || ""} ${r.last_name || ""}`.toLowerCase().includes(needle))
      );
    });
  }, [rows, q, kind]);

  const counts = useMemo(() => ({
    total: rows.length,
    leadMagnet: rows.filter(r => r.kind === "lead_magnet").length,
    gate: rows.filter(r => r.kind === "gate").length,
  }), [rows]);

  function downloadCSV() {
    const headers = [
      "created_at","kind","post_title","post_slug","email","first_name","last_name","company","role","country","consent","source",
    ];
    const escape = (v: any) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")].concat(
      filtered.map(r => headers.map(h => escape((r as any)[h])).join(","))
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `blog-leads-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Total leads" value={counts.total} />
        <Stat label="Lead-magnet downloads" value={counts.leadMagnet} />
        <Stat label="Article unlocks" value={counts.gate} />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by email, name, company or article…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5 bg-card">
          {(["all","lead_magnet","gate"] as const).map(k => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium ${kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {k === "all" ? "All" : k === "lead_magnet" ? "Lead magnet" : "Gate"}
            </button>
          ))}
        </div>
        <Button variant="outline" onClick={downloadCSV} disabled={!filtered.length}>
          <Download className="h-4 w-4 mr-1.5" /> Export CSV
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <Users className="h-6 w-6 mx-auto mb-2 opacity-50" />
            No leads captured yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="text-left">
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">Article</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Country</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <Badge variant={r.kind === "lead_magnet" ? "default" : "outline"} className="text-[10px]">
                        {r.kind === "lead_magnet" ? "Magnet" : "Gate"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 max-w-[260px]">
                      <div className="font-medium truncate">{r.post_title || "(deleted post)"}</div>
                      {r.post_slug && <div className="text-xs text-muted-foreground truncate">/{r.post_slug}</div>}
                    </td>
                    <td className="px-4 py-3">{r.email}</td>
                    <td className="px-4 py-3">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</td>
                    <td className="px-4 py-3">{r.company || "—"}</td>
                    <td className="px-4 py-3">{r.role || "—"}</td>
                    <td className="px-4 py-3">{r.country || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}