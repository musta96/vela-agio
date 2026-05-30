import { useEffect, useState } from "react";
import { OwnerPageHeader, KpiStrip } from "@/components/owner/OwnerLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Bot, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Signal = {
  id: string; created_at: string; signal_type: string; symbol: string | null;
  confidence: number | null; status: string; retracted_at: string | null;
  retracted_reason: string | null; disclaimer: string | null;
};

export default function OwnerAISignals() {
  const [rows, setRows] = useState<Signal[]>([]);
  const [target, setTarget] = useState<Signal | null>(null);
  const [reason, setReason] = useState("");

  async function load() {
    const { data } = await supabase.from("ai_signal_log")
      .select("id,created_at,signal_type,symbol,confidence,status,retracted_at,retracted_reason,disclaimer")
      .order("created_at", { ascending: false }).limit(100);
    setRows((data as Signal[]) || []);
  }
  useEffect(() => { load(); }, []);

  async function retract() {
    if (!target) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("ai_signal_log").update({
      status: "retracted",
      retracted_at: new Date().toISOString(),
      retracted_reason: reason || "Retracted by owner",
      retracted_by: u.user?.id,
    }).eq("id", target.id);
    if (error) { toast.error("Could not retract"); return; }
    toast.success("Signal retracted");
    setTarget(null); setReason(""); load();
  }

  const total = rows.length;
  const retracted = rows.filter(r => r.status === "retracted").length;
  const lowConf = rows.filter(r => (r.confidence ?? 1) < 0.55).length;
  const avgConf = total ? (rows.reduce((s, r) => s + (r.confidence ?? 0), 0) / total) : 0;

  return (
    <>
      <OwnerPageHeader title="AI signal governance"
        subtitle="Audit, attribute and retract every model-generated signal."
      />
      <KpiStrip items={[
        { label: "Signals (100 last)", value: total },
        { label: "Retracted", value: retracted, tone: retracted ? "warn" : "ok", sub: retracted ? "Action required" : "Healthy" },
        { label: "Low confidence", value: lowConf, sub: "<55% threshold" },
        { label: "Avg confidence", value: `${Math.round(avgConf * 100)}%` },
      ]} />

      <div className="bg-card border border-border rounded-2xl overflow-hidden mt-8">
        <div className="px-6 py-4 border-b border-border flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Recent signals</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">When</th>
              <th className="text-left px-4 py-3 font-semibold">Type</th>
              <th className="text-left px-4 py-3 font-semibold">Symbol</th>
              <th className="text-left px-4 py-3 font-semibold">Confidence</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-right px-4 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(r => {
              const c = r.confidence ?? 0;
              return (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{format(new Date(r.created_at), "MMM d, HH:mm")}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className="font-mono text-[11px]">{r.signal_type}</Badge></td>
                  <td className="px-4 py-3 font-mono text-xs">{r.symbol || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={c < 0.55 ? "h-full bg-warning" : "h-full bg-success"} style={{ width: `${c * 100}%` }} />
                      </div>
                      <span className="text-xs tabular-nums">{Math.round(c * 100)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {r.status === "retracted"
                      ? <Badge className="bg-destructive/10 text-destructive border-destructive/30"><AlertTriangle className="h-3 w-3 mr-1"/>Retracted</Badge>
                      : <Badge variant="outline" className="text-success border-success/40">Published</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.status !== "retracted" && (
                      <Button variant="ghost" size="sm" onClick={() => setTarget(r)}>Retract</Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground text-sm">No signals yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Retract signal</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will mark the signal as retracted everywhere it appears.</p>
          <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (shown in audit log)" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={retract}>Retract signal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}