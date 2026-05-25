import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { TopNav } from "@/components/TopNav";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureFlags, FeatureFlag } from "@/hooks/useFeatureFlags";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Shield, Search, RefreshCw, Power, Eye } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  monetization: "Monetization & Pricing",
  ai: "AI Features",
  data: "Market Data",
  portfolio: "Portfolio Tools",
  research: "Research & Quant",
  consumer: "Consumer & Onboarding",
  platform: "Platform",
  general: "General",
};

export default function AdminSettings() {
  const { user, loading: authLoading } = useAuth();
  const { flags, loading, refresh } = useFeatureFlags();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin")
      .maybeSingle().then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  const grouped = useMemo(() => {
    const list = Object.values(flags).filter(f =>
      !query ||
      f.key.toLowerCase().includes(query.toLowerCase()) ||
      f.label.toLowerCase().includes(query.toLowerCase()) ||
      (f.description ?? "").toLowerCase().includes(query.toLowerCase())
    );
    const out: Record<string, FeatureFlag[]> = {};
    for (const f of list) (out[f.category] ||= []).push(f);
    for (const k of Object.keys(out)) out[k].sort((a, b) => a.label.localeCompare(b.label));
    return out;
  }, [flags, query]);

  const totalOn = Object.values(flags).filter(f => f.enabled).length;
  const total = Object.values(flags).length;

  if (authLoading || isAdmin === null) {
    return <div className="min-h-screen bg-background"><TopNav /><div className="container mx-auto p-6 text-muted-foreground">Loading…</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <TopNav />
        <div className="container mx-auto p-6">
          <Card><CardContent className="p-8 text-center">
            <Shield className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h2 className="text-lg font-semibold">Admin only</h2>
            <p className="text-sm text-muted-foreground mt-1">You need the <code>admin</code> role to access this page.</p>
          </CardContent></Card>
        </div>
      </div>
    );
  }

  const toggle = async (flag: FeatureFlag, next: boolean) => {
    setBusy(flag.key);
    const { error } = await supabase
      .from("feature_flags")
      .update({ enabled: next, updated_by: user.id })
      .eq("key", flag.key);
    setBusy(null);
    if (error) { toast.error(`Failed: ${error.message}`); return; }
    toast.success(`${flag.label} ${next ? "enabled" : "disabled"}`);
    await refresh();
  };

  const bulk = async (enabled: boolean) => {
    const keys = Object.keys(flags);
    if (!keys.length) return;
    const { error } = await supabase.from("feature_flags").update({ enabled, updated_by: user.id }).in("key", keys);
    if (error) { toast.error(error.message); return; }
    toast.success(enabled ? "All features enabled" : "All features disabled");
    await refresh();
  };

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <div className="container mx-auto p-4 sm:p-6 space-y-6 max-w-6xl">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" /> Admin Settings
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Toggle features platform-wide. Changes apply in real time to all users.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1"><Power className="h-3 w-3" /> {totalOn}/{total} on</Badge>
            <Button size="sm" variant="outline" onClick={() => refresh()}><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search features…" value={query} onChange={e => setQuery(e.target.value)} className="pl-9" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => bulk(true)}>Enable all</Button>
              <Button size="sm" variant="outline" onClick={() => bulk(false)}>Disable all</Button>
            </div>
          </CardContent>
        </Card>

        {loading && <div className="text-muted-foreground text-sm">Loading flags…</div>}

        {Object.keys(grouped).sort().map(cat => (
          <Card key={cat}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                {CATEGORY_LABELS[cat] ?? cat}
                <Badge variant="outline" className="font-normal text-xs">{grouped[cat].length}</Badge>
              </CardTitle>
              <CardDescription className="text-xs">Category: <code>{cat}</code></CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 pt-0">
              {grouped[cat].map(f => (
                <div key={f.key} className="flex items-start sm:items-center justify-between gap-3 py-2.5 border-t first:border-t-0 border-border/60">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{f.label}</span>
                      <code className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{f.key}</code>
                      {!f.enabled && <Badge variant="outline" className="text-[10px] h-4 px-1"><Eye className="h-2.5 w-2.5 mr-0.5" />hidden</Badge>}
                    </div>
                    {f.description && <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>}
                  </div>
                  <Switch
                    checked={f.enabled}
                    disabled={busy === f.key}
                    onCheckedChange={(v) => toggle(f, v)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        {!loading && total === 0 && (
          <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">No feature flags found.</CardContent></Card>
        )}
      </div>
    </div>
  );
}