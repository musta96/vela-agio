import { useEffect, useState } from "react";
import { OwnerPageHeader, KpiStrip } from "@/components/owner/OwnerLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Pause, Download } from "lucide-react";
import { format } from "date-fns";

type Row = { id: number; ts: string; actor_email: string | null; action: string; entity: string | null; entity_id: string | null; payload: any };

const CAT_COLOR: Record<string, string> = {
  user: "bg-success", signal: "bg-primary", billing: "bg-warning", api: "bg-secondary", data: "bg-destructive", gdpr: "bg-accent",
};

function inferCat(action: string, entity: string | null): string {
  if (entity) return entity.toLowerCase();
  const a = action.toLowerCase();
  if (a.includes("login") || a.includes("signup") || a.includes("suspend")) return "user";
  if (a.includes("signal")) return "signal";
  if (a.includes("payment") || a.includes("refund")) return "billing";
  if (a.includes("api")) return "api";
  if (a.includes("gdpr")) return "gdpr";
  return "data";
}

export default function OwnerActivity() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<"All" | "Users" | "Signals" | "API" | "Errors">("All");

  useEffect(() => { (async () => {
    const { data } = await supabase.from("audit_log").select("id,ts,actor_email,action,entity,entity_id,payload").order("ts", { ascending: false }).limit(40);
    setRows((data || []) as any);
  })(); }, []);

  const filtered = rows.filter((r) => {
    if (filter === "All") return true;
    const c = inferCat(r.action, r.entity);
    if (filter === "Users") return c === "user";
    if (filter === "Signals") return c === "signal";
    if (filter === "API") return c === "api";
    if (filter === "Errors") return r.action.toLowerCase().includes("fail") || r.action.toLowerCase().includes("error");
    return true;
  });

  return (
    <>
      <OwnerPageHeader
        title="Live activity"
        subtitle="Real-time event stream · Auto-refreshing"
        actions={
          <>
            <Button variant="outline" size="sm"><Pause className="h-4 w-4 mr-1.5" />Pause stream</Button>
            <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1.5" />Export log</Button>
          </>
        }
      />
      <KpiStrip items={[
        { label: "Active sessions", value: "1,284", sub: "↑ +42 last 5min", tone: "up" },
        { label: "Events / min", value: "3,410", sub: "Peak", tone: "warn" },
        { label: "API calls / min", value: "8,820", sub: "Normal", tone: "ok" },
        { label: "Error rate", value: "0.04%", sub: "Below threshold", tone: "ok" },
      ]} />

      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Event stream</h3>
            <div className="flex items-center gap-1 text-xs">
              {(["All", "Users", "Signals", "API", "Errors"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={filter === f ? "px-2.5 py-1 rounded-md bg-primary/10 text-primary font-medium" : "px-2.5 py-1 rounded-md text-muted-foreground hover:bg-muted"}>{f}</button>
              ))}
            </div>
          </div>
          <ul className="space-y-2">
            {filtered.map((r) => {
              const cat = inferCat(r.action, r.entity);
              return (
                <li key={r.id} className="flex items-center gap-3 text-[13px] py-1.5 border-b border-border/50 last:border-b-0">
                  <span className="font-mono text-[11px] text-muted-foreground w-16">{format(new Date(r.ts), "HH:mm:ss")}</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${CAT_COLOR[cat] || "bg-muted"}`} />
                  <span className="font-medium">{r.action}</span>
                  {r.entity_id && <span className="text-muted-foreground">- <span className="font-mono text-[11px]">{r.entity_id}</span></span>}
                  <span className="ml-auto text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-muted">{cat}</span>
                </li>
              );
            })}
            {!filtered.length && <li className="text-sm text-muted-foreground py-8 text-center">No events.</li>}
          </ul>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">Top active users</h3>
            <ul className="space-y-3 text-sm">
              {["Marco Rossi", "Sara Ferri", "Anna Verdi"].map((n, i) => (
                <li key={n} className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-primary/15 grid place-items-center text-[10px] font-bold text-primary">{n.split(" ").map(w => w[0]).join("")}</div>
                  <div className="flex-1"><div className="font-medium text-[13px]">{n}</div><div className="text-[11px] text-muted-foreground">{[142, 98, 76][i]} events · Pro</div></div>
                  <span className="text-[11px] text-muted-foreground">{["now", "1m", "3m"][i]}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">System health</h3>
            {[
              { label: "API p95 latency", value: "84ms", pct: 28, tone: "bg-success" },
              { label: "Error rate", value: "0.04%", pct: 4, tone: "bg-success" },
              { label: "DB query time", value: "210ms", pct: 70, tone: "bg-warning" },
              { label: "Feed latency", value: "340ms", pct: 95, tone: "bg-destructive" },
            ].map((s) => (
              <div key={s.label} className="mb-2.5">
                <div className="flex justify-between text-[12px]"><span className="text-muted-foreground">{s.label}</span><span className="font-semibold">{s.value}</span></div>
                <div className="h-1.5 rounded bg-muted overflow-hidden mt-1"><div className={`h-full ${s.tone}`} style={{ width: `${s.pct}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}