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
  const [missingCount, setMissingCount] = useState<number>(0);
  const [missingSample, setMissingSample] = useState<{ subscription_id: string; user_id: string; status: string; price_id: string | null }[]>([]);
  const provider = useMemo(detectProvider, []);

  const load = async (e = env) => {
    setLoading(true);
    setErr(null);
    const [overview, missing] = await Promise.all([
      supabase.rpc("admin_revenue_overview", { _env: e }),
      supabase.rpc("admin_subscriptions_missing_plan" as any, { _env: e }),
    ]);
    if (overview.error) setErr(overview.error.message);
    else setData(overview.data as unknown as Overview);
    const rows = (missing.data as any[]) || [];
    setMissingCount(rows.length);
    setMissingSample(rows.slice(0, 5));
    setLoading(false);
  };

  useEffect(() => {
    load(env);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env]);

  return (
    <div className="space-y-4">
      <ProviderStatusBanner provider={provider} env={env} />
      {missingCount > 0 && <MissingPlanWarning count={missingCount} sample={missingSample} env={env} />}

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
          {data.total === 0 && (
            <Card className="p-4 border-dashed text-xs text-muted-foreground flex gap-3 items-start">
              <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="space-y-1">
                <div className="font-medium text-foreground">No {env} subscriptions recorded yet.</div>
                <div>Reasons this view can be empty even when Stripe is connected:</div>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>The Stripe webhook (<code className="font-mono">payments-webhook</code>) is not delivering events into the <code className="font-mono">subscriptions</code> table.</li>
                  <li>You're looking at <span className="font-medium">{env}</span> — try the other environment toggle.</li>
                  <li>Plans in <code className="font-mono">subscription_plans</code> have no <code className="font-mono">stripe_monthly_price_id</code> / <code className="font-mono">stripe_yearly_price_id</code>, so checkout can't create subscriptions.</li>
                  <li>Nobody has completed a paid checkout in this environment yet.</li>
                </ul>
              </div>
            </Card>
          )}
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

function ProviderStatusBanner({ provider, env }: { provider: ProviderState; env: "live" | "sandbox" }) {
  const Icon = provider.tone === "ok" ? CheckCircle2 : provider.tone === "warn" ? AlertTriangle : XCircle;
  const toneClass =
    provider.tone === "ok"
      ? "border-success/40 bg-success/5 text-success"
      : provider.tone === "warn"
      ? "border-amber-400/40 bg-amber-400/5 text-amber-600 dark:text-amber-400"
      : "border-destructive/40 bg-destructive/5 text-destructive";
  return (
    <Card className={`p-3 flex items-start gap-3 ${toneClass}`}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="text-xs flex-1 min-w-0">
        <div className="font-semibold flex items-center gap-2 flex-wrap">
          <span>{provider.label}</span>
          <Badge variant="outline" className="text-[10px] font-normal">Stripe · viewing {env}</Badge>
        </div>
        <p className="text-[11px] opacity-90 mt-0.5">{provider.detail}</p>
      </div>
    </Card>
  );
}
function MissingPlanWarning({ count, sample, env }: { count: number; sample: { subscription_id: string; user_id: string; status: string; price_id: string | null }[]; env: "live" | "sandbox" }) {
  return (
    <Card className="p-3 flex items-start gap-3 border-amber-400/40 bg-amber-400/5 text-amber-600 dark:text-amber-400">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="text-xs flex-1 min-w-0 space-y-2">
        <div className="font-semibold">
          {count} {env} subscription{count === 1 ? "" : "s"} not mapped to a plan
        </div>
        <p className="text-[11px] opacity-90">
          These rows have a <code className="font-mono">price_id</code> that does not match any{" "}
          <code className="font-mono">stripe_monthly_price_id</code> or <code className="font-mono">stripe_yearly_price_id</code>{" "}
          in <code className="font-mono">subscription_plans</code>. They will not count toward MRR/ARR until fixed.
        </p>
        {sample.length > 0 && (
          <ul className="text-[11px] font-mono opacity-90 list-disc pl-4 space-y-0.5">
            {sample.map((r) => (
              <li key={r.subscription_id}>
                {r.subscription_id.slice(0, 8)}… · {r.status} · price=<span className="italic">{r.price_id || "null"}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={() => (window.location.href = "/owner/plans")}>
            Open Plans & pricing
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <a href="https://dashboard.stripe.com/prices" target="_blank" rel="noreferrer">Find price IDs in Stripe</a>
          </Button>
        </div>
      </div>
    </Card>
  );
}
