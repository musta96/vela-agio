import { useEffect, useState } from "react";
import { OwnerPageHeader } from "@/components/owner/OwnerLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { Plus } from "lucide-react";

const ROLES = [
  { key: "Owner", desc: "All permissions", count: 1 },
  { key: "Admin", desc: "Most permissions", count: 3 },
  { key: "Support", desc: "User management only", count: 6 },
  { key: "Analyst", desc: "Read-only data", count: 4 },
  { key: "Finance", desc: "Billing & revenue", count: 2 },
];

const PERMS: { group: string; items: string[] }[] = [
  { group: "User management", items: ["View all users", "Create / suspend users", "Impersonate users", "Delete & anonymise", "Override permissions"] },
  { group: "Billing", items: ["View revenue & MRR", "Issue refunds", "Manage plans & pricing", "View payment methods", "Export invoices"] },
  { group: "Platform & AI", items: ["Manage feature flags", "Activate kill switches", "Configure AI signals", "Manage data feeds", "View audit log"] },
  { group: "Compliance", items: ["Handle GDPR requests", "Manage legal documents", "Force re-consent", "Export compliance reports", "Geo-restriction controls"] },
];

export default function OwnerRoles() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState("Owner");

  useEffect(() => { (async () => {
    const { data } = await supabase.from("user_roles").select("role");
    const map: Record<string, number> = {};
    (data || []).forEach((r: any) => { map[r.role] = (map[r.role] || 0) + 1; });
    setCounts(map);
  })(); }, []);

  return (
    <>
      <OwnerPageHeader title="Roles & access" subtitle="Define what each role can see and do across the platform"
        actions={<Button size="sm"><Plus className="h-4 w-4 mr-1.5" />Create role</Button>}
      />

      <div className="grid lg:grid-cols-[280px_1fr] gap-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold mb-2 px-1">Roles</div>
          <ul className="space-y-1.5">
            {ROLES.map((r) => (
              <li key={r.key}>
                <button onClick={() => setSelected(r.key)} className={`w-full text-left rounded-xl border p-3.5 transition-colors ${
                  selected === r.key ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"
                }`}>
                  <div className="font-semibold text-sm">{r.key}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{(counts[r.key.toLowerCase()] ?? r.count)} members · {r.desc}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold">{selected} - permissions</h3>
            <Button variant="outline" size="sm">Duplicate role</Button>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-6">
            {PERMS.map((g) => (
              <div key={g.group}>
                <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold mb-2">{g.group}</div>
                <ul className="space-y-2.5">
                  {g.items.map((p) => (
                    <li key={p} className="flex items-center justify-between text-sm">
                      <span>{p}</span>
                      <Switch defaultChecked />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}