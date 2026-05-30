import { useEffect, useState } from "react";
import { OwnerPageHeader } from "@/components/owner/OwnerLayout";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search } from "lucide-react";

type Flag = { key: string; label: string; description: string | null; enabled: boolean; category: string };

export default function OwnerFeatureFlags() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => { (async () => {
    const { data } = await supabase.from("feature_flags").select("*").order("category").order("key");
    setFlags((data as Flag[]) || []);
  })(); }, []);

  async function toggle(key: string, enabled: boolean) {
    setFlags(f => f.map(x => x.key === key ? { ...x, enabled } : x));
    const { error } = await supabase.from("feature_flags").update({ enabled }).eq("key", key);
    if (error) { toast.error("Could not update flag"); return; }
    toast.success(`${key} ${enabled ? "enabled" : "disabled"}`);
  }

  const filtered = flags.filter(f =>
    !q || f.key.toLowerCase().includes(q.toLowerCase()) || f.label.toLowerCase().includes(q.toLowerCase())
  );
  const grouped = filtered.reduce<Record<string, Flag[]>>((acc, f) => {
    (acc[f.category] ||= []).push(f); return acc;
  }, {});

  return (
    <>
      <OwnerPageHeader title="Feature flags"
        subtitle="Toggle features per environment without redeploying." />
      <div className="relative max-w-md mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search flags…" value={q} onChange={e => setQ(e.target.value)} className="pl-9" />
      </div>
      <div className="space-y-6">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-6 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider">{cat}</span>
              <Badge variant="outline">{items.length}</Badge>
            </div>
            <ul className="divide-y divide-border">
              {items.map(f => (
                <li key={f.key} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{f.label}</div>
                    <div className="text-xs text-muted-foreground font-mono">{f.key}</div>
                    {f.description && <div className="text-xs text-muted-foreground mt-1">{f.description}</div>}
                  </div>
                  <Switch checked={f.enabled} onCheckedChange={(v) => toggle(f.key, v)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!filtered.length && <div className="text-sm text-muted-foreground text-center py-12">No flags match your search.</div>}
      </div>
    </>
  );
}