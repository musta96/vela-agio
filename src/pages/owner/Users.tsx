import { useEffect, useState } from "react";
import { OwnerPageHeader, KpiStrip } from "@/components/owner/OwnerLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Download, Gift, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";

type Row = { user_id: string; display_name: string | null; created_at: string; country_residence: string | null; suspended: boolean };

export default function OwnerUsers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<"All plans" | "Free" | "Pro" | "Team" | "Active" | "Trial" | "Suspended">("All plans");
  const [q, setQ] = useState("");
  const [total, setTotal] = useState(0);

  useEffect(() => { (async () => {
    const [{ data: profiles, count }, { data: susp }] = await Promise.all([
      supabase.from("profiles").select("user_id,display_name,created_at,country_residence", { count: "exact" }).order("created_at", { ascending: false }).limit(30),
      supabase.from("user_suspensions").select("user_id"),
    ]);
    const sus = new Set((susp || []).map((s: any) => s.user_id));
    setRows((profiles || []).map((p: any) => ({ ...p, suspended: sus.has(p.user_id) })));
    setTotal(count || 0);
  })(); }, []);

  const filtered = rows.filter((r) => {
    if (filter === "Suspended" && !r.suspended) return false;
    if (q && !(r.display_name || "").toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <OwnerPageHeader
        title="All users"
        subtitle={`${total.toLocaleString()} total · ${rows.filter(r => !r.suspended).length.toLocaleString()} active · ${Math.floor(total * 0.03)} in trial`}
        actions={<>
          <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
          <Button size="sm"><UserPlus className="h-4 w-4 mr-1.5" />Create user</Button>
        </>}
      />
      <KpiStrip items={[
        { label: "Total", value: total.toLocaleString(), sub: "+284 this week", tone: "up" },
        { label: "Pro", value: Math.floor(total * 0.26).toLocaleString(), sub: "25.7%" },
        { label: "Team", value: "184", sub: "+12 this month", tone: "up" },
        { label: "Suspended", value: rows.filter(r => r.suspended).length || 47, sub: "Review needed", tone: "warn" },
      ]} />

      <div className="rounded-2xl border border-border bg-card mt-6 overflow-hidden">
        <div className="p-4 flex flex-wrap items-center gap-3 border-b border-border">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, user ID…" className="h-9 px-3 rounded-lg border border-border bg-background text-sm flex-1 min-w-[240px] max-w-md" />
          <div className="flex items-center gap-1 text-xs">
            {(["All plans", "Free", "Pro", "Team", "Active", "Trial", "Suspended"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={filter === f ? "px-2.5 py-1 rounded-md bg-primary/10 text-primary font-medium" : "px-2.5 py-1 rounded-md text-muted-foreground hover:bg-muted"}>{f}</button>
            ))}
          </div>
          <select className="ml-auto h-9 px-3 rounded-lg border border-border bg-background text-sm">
            <option>Sort by: Last active</option><option>Sort by: Joined</option><option>Sort by: MRR</option>
          </select>
        </div>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold bg-muted/30">
            <tr><th className="text-left px-4 py-3"><input type="checkbox" /></th><th className="text-left">User</th><th className="text-left">Plan</th><th className="text-left">Status</th><th className="text-left">MRR</th><th className="text-left">Country</th><th className="text-left">Joined</th><th className="text-left">Last active</th><th /></tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const initials = (r.display_name || "??").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
              return (
                <tr key={r.user_id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3"><input type="checkbox" /></td>
                  <td><Link to={`/owner/users/${r.user_id}`} className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-full bg-primary/15 grid place-items-center text-[10px] font-bold text-primary">{initials}</div>
                    <div><div className="font-medium hover:underline">{r.display_name || "-"}</div><div className="text-xs text-muted-foreground font-mono">#{r.user_id.slice(0, 4)}</div></div>
                  </Link></td>
                  <td><span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted">PRO</span></td>
                  <td><span className="inline-flex items-center gap-1 text-xs">
                    <span className={`h-1.5 w-1.5 rounded-full ${r.suspended ? "bg-destructive" : "bg-success"}`} />
                    {r.suspended ? "Suspended" : "Active"}
                  </span></td>
                  <td>€49/mo</td>
                  <td className="text-xs">{r.country_residence || "-"}</td>
                  <td className="text-xs text-muted-foreground">{format(new Date(r.created_at), "d MMM yy")}</td>
                  <td className="text-xs text-muted-foreground">2 min ago</td>
                  <td className="pr-4 text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/owner/users/${r.user_id}#manual-plan`}>
                        <Gift className="h-4 w-4 mr-1.5" />Grant plan
                      </Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="p-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>Showing 1–{filtered.length} of {total.toLocaleString()}</span>
          <div className="flex gap-1"><Button variant="outline" size="sm">← Prev</Button><Button size="sm">Next →</Button></div>
        </div>
      </div>
    </>
  );
}