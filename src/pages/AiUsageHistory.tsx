import { useEffect, useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { TopNav } from "@/components/TopNav";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useAiCredits } from "@/hooks/useAiCredits";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Sparkles, KeyRound, Crown, Calendar, TrendingUp } from "lucide-react";

interface UsageRow { created_at: string; credits: number; feature: string | null; model: string | null; }

function startOfNextMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export default function AiUsageHistory() {
  const { user, loading: authLoading } = useAuth();
  const credits = useAiCredits();
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const since = new Date();
      since.setMonth(since.getMonth() - 11);
      since.setDate(1);
      const { data } = await supabase
        .from("ai_usage_log")
        .select("created_at, credits, feature, model")
        .eq("user_id", user.id)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(2000);
      setRows((data ?? []) as UsageRow[]);
      setLoading(false);
    })();
  }, [user]);

  const monthly = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const key = r.created_at.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + (r.credits ?? 1));
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [rows]);

  const recent = rows.slice(0, 25);
  const resetAt = startOfNextMonth();

  if (authLoading) return <div className="min-h-screen bg-background"><TopNav /><div className="container mx-auto p-6 text-muted-foreground">Loading…</div></div>;
  if (!user) return <Navigate to="/auth" replace />;

  const Icon = credits.status?.source === "byo" ? KeyRound : credits.status?.source === "paid" ? Crown : Sparkles;

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <div className="container mx-auto p-6 max-w-4xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><TrendingUp className="h-5 w-5" /> AI usage history</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track your monthly Lovable AI credit usage. Non-AI features (paper trading, watchlist, screeners, charts) are unaffected by the AI cap.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Icon className="h-4 w-4" /> This month</CardTitle>
            <CardDescription className="capitalize">{credits.status?.tier ?? "—"} plan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {credits.unlimited ? (
              <p className="text-sm">Using your own API key — no monthly cap applies.</p>
            ) : credits.hasCap ? (
              <>
                <div className="flex justify-between text-sm">
                  <span>{credits.used} / {credits.limit} credits used</span>
                  <span className={credits.exhausted ? "text-destructive font-medium" : "text-muted-foreground"}>
                    {credits.remaining} remaining
                  </span>
                </div>
                <Progress value={credits.pctUsed} />
                <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Counter resets on {resetAt.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
                </p>
                {credits.exhausted && (
                  <p className="text-xs text-destructive">
                    AI is paused until reset. <Link to="/upgrade" className="underline">Upgrade</Link> or <Link to="/settings?tab=Connections" className="underline">add a BYO key</Link> to keep using the AI now.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm">Your plan doesn't include Lovable AI credits. <Link to="/upgrade" className="underline">See pricing</Link>.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Last 12 months</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : monthly.length === 0 ? (
              <p className="text-sm text-muted-foreground">No AI usage yet.</p>
            ) : (
              <div className="space-y-2">
                {monthly.map(([m, c]) => {
                  const pct = credits.hasCap ? Math.min(100, Math.round((c / (credits.limit as number)) * 100)) : 0;
                  return (
                    <div key={m}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-mono">{m}</span>
                        <span className="text-muted-foreground">{c} credits</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${credits.hasCap ? pct : Math.min(100, c)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent requests</CardTitle></CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent AI activity.</p>
            ) : (
              <div className="text-xs">
                <div className="grid grid-cols-12 gap-2 py-1 font-medium text-muted-foreground border-b border-border">
                  <div className="col-span-4">When</div>
                  <div className="col-span-4">Feature</div>
                  <div className="col-span-3">Model</div>
                  <div className="col-span-1 text-right">Credits</div>
                </div>
                {recent.map((r, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 py-1 border-b border-border/50">
                    <div className="col-span-4">{new Date(r.created_at).toLocaleString()}</div>
                    <div className="col-span-4 truncate">{r.feature ?? "—"}</div>
                    <div className="col-span-3 truncate font-mono opacity-75">{r.model ?? "—"}</div>
                    <div className="col-span-1 text-right">{r.credits ?? 1}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}