import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, KeyRound, Crown, Loader2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface Status {
  allowed: boolean;
  source: "byo" | "beta" | "paid" | "none";
  tier: string;
  modelCap: string;
  quotaUsed: number | null;
  quotaLimit: number | null;
  byoProvider: string | null;
  reason: string | null;
}

function Badge({ tone, children }: { tone: "ok" | "warn" | "info"; children: React.ReactNode }) {
  const cls = tone === "ok"
    ? "bg-success/10 text-success border-success/30"
    : tone === "warn"
    ? "bg-warning/10 text-warning border-warning/30"
    : "bg-muted text-foreground border-border";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

export function AIAccessCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-access-status");
      if (error) throw error;
      setStatus(data as Status);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[ai-access] status fetch failed", e);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const headline = !status
    ? "Unknown"
    : status.source === "byo"
    ? "Using your own API key"
    : status.source === "paid"
    ? `Paid plan · ${status.tier}`
    : status.source === "beta"
    ? "Beta access (granted by Vela)"
    : "Free tier";

  const Icon = status?.source === "byo" ? KeyRound : status?.source === "paid" ? Crown : Sparkles;
  const tone: "ok" | "warn" | "info" = status?.allowed ? "ok" : "warn";
  const statusLabel = status?.allowed ? "AI enabled" : "AI disabled";

  return (
    <Card className="p-6 rounded-2xl">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold">AI access</h2>
            <p className="text-sm text-muted-foreground">Where your AI features get their compute from.</p>
          </div>
        </div>
        <Badge tone={tone}>{statusLabel}</Badge>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking…</div>
      ) : !status ? (
        <p className="text-sm text-muted-foreground">Couldn't load status. Try again.</p>
      ) : (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Current source</div>
              <div className="text-sm font-semibold mt-0.5">{headline}</div>
              {status.byoProvider && (
                <div className="text-xs text-muted-foreground mt-0.5">{status.byoProvider}</div>
              )}
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Model cap</div>
              <div className="text-sm font-semibold mt-0.5 capitalize">{status.modelCap}</div>
              {status.quotaLimit !== null && status.quotaLimit > 0 && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  Quota: {status.quotaUsed ?? 0} / {status.quotaLimit} this month
                </div>
              )}
              {status.quotaLimit === -1 && (
                <div className="text-xs text-muted-foreground mt-0.5">Unlimited</div>
              )}
            </div>
          </div>

          {!status.allowed && status.reason && (
            <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">
              {status.reason}
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {status.source !== "byo" && (
              <Button asChild size="sm" variant="outline"><Link to="/settings?tab=Connections">Use my own API key</Link></Button>
            )}
            {status.source === "none" && (
              <Button asChild size="sm"><Link to="/pricing">Upgrade plan</Link></Button>
            )}
            <Button size="sm" variant="ghost" onClick={load} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}