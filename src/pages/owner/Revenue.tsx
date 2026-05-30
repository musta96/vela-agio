import { useEffect, useState } from "react";
import { OwnerPageHeader, KpiStrip } from "@/components/owner/OwnerLayout";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function OwnerRevenue() {
  const [users, setUsers] = useState(0);
  useEffect(() => { (async () => {
    const { count } = await supabase.from("profiles").select("user_id", { count: "exact", head: true });
    setUsers(count || 0);
  })(); }, []);

  const mrr = Math.max(users * 9, 12400);
  const arr = mrr * 12;
  const arpu = users ? mrr / users : 0;

  const plans = [
    { name: "Free", users: Math.round(users * 0.62), mrr: 0, share: 62 },
    { name: "Pro €19", users: Math.round(users * 0.28), mrr: Math.round(users * 0.28) * 19, share: 28 },
    { name: "Elite €49", users: Math.round(users * 0.08), mrr: Math.round(users * 0.08) * 49, share: 8 },
    { name: "Family €79", users: Math.round(users * 0.02), mrr: Math.round(users * 0.02) * 79, share: 2 },
  ];

  return (
    <>
      <OwnerPageHeader title="Revenue" subtitle="Subscription, churn and lifetime value across plans."
        actions={<Button variant="outline" size="sm"><Download className="h-4 w-4 mr-2"/>Export CSV</Button>} />
      <KpiStrip items={[
        { label: "MRR", value: `€${mrr.toLocaleString()}`, sub: "+8.2% MoM", tone: "up" },
        { label: "ARR", value: `€${arr.toLocaleString()}` },
        { label: "ARPU", value: `€${arpu.toFixed(2)}` },
        { label: "Paid users", value: Math.round(users * 0.38).toLocaleString(), sub: `${users} total` },
        { label: "Churn (30d)", value: "2.4%", sub: "−0.3pp", tone: "up" },
      ]} />

      <div className="grid lg:grid-cols-3 gap-6 mt-8">
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Revenue trend</h3>
            <span className="text-xs text-muted-foreground">Last 12 months</span>
          </div>
          <div className="h-56 flex items-end gap-1.5">
            {Array.from({ length: 12 }).map((_, i) => {
              const h = 30 + Math.sin(i / 2) * 18 + i * 4;
              return <div key={i} className="flex-1 rounded-t bg-primary/70" style={{ height: `${h}%` }} />;
            })}
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><TrendingUp className="h-4 w-4"/>Plan mix</h3>
          <ul className="space-y-3 text-sm">
            {plans.map(p => (
              <li key={p.name}>
                <div className="flex justify-between mb-1"><span>{p.name}</span><span className="text-muted-foreground">€{p.mrr.toLocaleString()}</span></div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${p.share}%` }} /></div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}