import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";

type Overview = {
  env: string;
  total: number;
  active: number;
  trialing: number;
  past_due: number;
  canceled: number;
  new_30d: number;
  churn_30d: number;
  mrr: number;
  arr: number;
  by_tier: { tier: string; plan: string | null; subs: number; mrr: number }[];
};

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v || 0);

type ProviderState = {
  status: "connected" | "test-only" | "missing";
  label: string;
  detail: string;
  tone: "ok" | "warn" | "err";
};

function detectProvider(): ProviderState {
  const token = (import.meta as any).env?.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;
  if (!token) {
    return {
      status: "missing",
      label: "Payment provider not connected",
      detail:
        "No Stripe publishable token is configured for this build (VITE_PAYMENTS_CLIENT_TOKEN missing). Complete Stripe go-live or enable the built-in Stripe integration to start collecting payments.",
      tone: "err",
    };
  }
  if (token.startsWith("pk_live_")) {
    return {
      status: "connected",
      label: "Stripe live keys configured",
      detail: "Checkout sessions in production will hit your live Stripe account. New subscriptions appear here as the webhook records them.",
      tone: "ok",
    };
  }
  if (token.startsWith("pk_test_")) {
    return {
      status: "test-only",
      label: "Stripe is in test mode",
      detail:
        "Only the sandbox client token is configured (pk_test_). Live revenue will stay at €0 until you finish Stripe go-live and live keys are provisioned.",
      tone: "warn",
    };
  }
  return {
    status: "missing",
    label: "Unrecognised payment token",
    detail: "VITE_PAYMENTS_CLIENT_TOKEN does not look like a Stripe publishable key.",
    tone: "err",
  };
}

export default function RevenueDashboard() {
  const [env, setEnv] = useState<"live" | "sandbox">("live");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const provider = useMemo(detectProvider, []);

  const load = async (e = env) => {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase.rpc("admin_revenue_overview", { _env: e });
    if (error) setErr(error.message);
    else setData(data as unknown as Overview);
    setLoading(false);
  };

  useEffect(() => {
    load(env);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env]);

  return (
    <div className="space-y-4">
      <ProviderStatusBanner provider={provider} env={env} />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Revenue</h2>
          <p className="text-xs text-muted-foreground">
            Live numbers from <code className="font-mono">subscriptions</code> joined to{" "}
            <code className="font-mono">subscription_plans</code>. MRR is estimated from plan price labels (yearly ÷ 12).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
            {(["live", "sandbox"] as const).map((e) => (
              <button
                key={e}
                onClick={() => setEnv(e)}
                className={`px-3 py-1.5 ${env === e ? "bg-primary text-primary-foreground" : "bg-background"}`}
              >
                {e}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => load()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {err && (
        <Card className="p-4 border-destructive/40 text-destructive text-sm">
          {err}
        </Card>
      )}

      {loading && !data ? (
        <Card className="p-10 flex items-center justify-center text-muted-foreground text-sm gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading revenue…
        </Card>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="MRR" value={fmtMoney(data.mrr)} />
            <Kpi label="ARR" value={fmtMoney(data.arr)} />
            <Kpi label="Active subs" value={String(data.active + data.trialing)} sub={`${data.trialing} trialing`} />
            <Kpi label="Past due" value={String(data.past_due)} tone={data.past_due > 0 ? "warn" : "ok"} />
            <Kpi label="New (30d)" value={String(data.new_30d)} />
            <Kpi label="Churned (30d)" value={String(data.churn_30d)} tone={data.churn_30d > 0 ? "warn" : "ok"} />
            <Kpi label="Canceled (total)" value={String(data.canceled)} />
            <Kpi label="All-time subs" value={String(data.total)} />
          </div>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">By tier</h3>
              <Badge variant="outline" className="text-[10px]">{data.by_tier.length} tiers</Badge>
            </div>
            {data.by_tier.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No active subscriptions in {env}. Once customers check out via Stripe they appear here.
              </p>
            ) : (
              <div className="space-y-1.5">
                {data.by_tier.map((row) => {
                  const pct = data.mrr > 0 ? Math.round((Number(row.mrr) / data.mrr) * 100) : 0;
                  return (
                    <div key={`${row.tier}-${row.plan}`} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium truncate">
                          {row.plan || row.tier}
                          <span className="text-muted-foreground ml-1.5">· {row.subs} subs</span>
                        </span>
                        <span className="tabular-nums">{fmtMoney(Number(row.mrr))} / mo</span>
                      </div>
                      <div className="h-1.5 rounded bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "warn" }) {
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone === "warn" ? "text-amber-500" : ""}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </Card>
  );
}