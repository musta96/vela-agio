import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Download, Plus, User, FileText, Coins, Briefcase, Bell, ShieldCheck, CreditCard, ExternalLink, Loader2, Plug, Sparkles, LifeBuoy } from "lucide-react";
import { PlayCircle } from "lucide-react";
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { ManageSubscriptionButton } from "@/components/ManageSubscriptionButton";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { AdvisoryAccessCard } from "@/components/settings/AdvisoryAccessCard";
import { TenantLicensingCard } from "@/components/settings/TenantLicensingCard";
import { ConnectionsCard } from "@/components/settings/ConnectionsCard";
import { AIAccessCard } from "@/components/settings/AIAccessCard";
import { AdvisorTogglesCard } from "@/components/settings/AdvisorTogglesCard";
import { BrokerSyncCard } from "@/components/BrokerSyncCard";
import { SupportCard } from "@/components/settings/SupportCard";
import { PaymentMethodCard } from "@/components/billing/PaymentMethodCard";
import { PastDueBanner } from "@/components/billing/PastDueBanner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { computeSuitability } from "@/lib/suitability";

type Tab = "Profile" | "Fiscal residency" | "Currencies" | "Broker connections" | "Notifications" | "Connections" | "AI" | "Privacy & data" | "Billing" | "Support";
const TABS: { id: Tab; icon: typeof User }[] = [
  { id: "Profile", icon: User },
  { id: "Fiscal residency", icon: FileText },
  { id: "Currencies", icon: Coins },
  { id: "Broker connections", icon: Briefcase },
  { id: "Notifications", icon: Bell },
  { id: "Connections", icon: Plug },
  { id: "AI", icon: Sparkles },
  { id: "Privacy & data", icon: ShieldCheck },
  { id: "Billing", icon: CreditCard },
  { id: "Support", icon: LifeBuoy },
];

const CURRENCIES = [
  { code: "EUR", label: "EUR €" },
  { code: "USD", label: "USD $" },
  { code: "GBP", label: "GBP £" },
  { code: "CHF", label: "CHF" },
];

const BROKERS = [
  { name: "SnapTrade · Degiro", status: "Live", sync: "2 min ago", accounts: 2, action: "Manage" },
  { name: "SnapTrade · Trade Republic", status: "Re-auth needed", sync: "14 days ago", accounts: 1, action: "Reconnect" },
  { name: "Coinbase", status: "Live", sync: "5 min ago", accounts: 1, action: "Manage" },
] as const;

function StatusPill({ s }: { s: string }) {
  const map: Record<string, string> = {
    Live: "bg-success/10 text-success border-success/30",
    "Re-auth needed": "bg-warning/10 text-warning border-warning/30",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${map[s] || "bg-muted text-foreground border-border"}`}>
      {s}
    </span>
  );
}

function ProfileTab() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [replaying, setReplaying] = useState(false);
  const replayOnboarding = async () => {
    setReplaying(true);
    try {
      try {
        localStorage.removeItem("vela.firstRun.done");
        localStorage.removeItem("vela_dashboard_tour_v1");
      } catch { /* ignore */ }
      if (user?.id) {
        await supabase.from("profiles").update({
          dashboard_tour_completed_at: null,
          first_run_completed_at: null,
          first_run_symbol: null,
          first_run_time_to_signal_ms: null,
        }).eq("user_id", user.id);
      }
      toast.success("Onboarding reset — taking you to the start");
      navigate("/dashboard");
    } catch (e: any) {
      toast.error("Couldn't reset onboarding", { description: e?.message });
    } finally {
      setReplaying(false);
    }
  };
  const [mifid, setMifid] = useState<{ completed_at: string | null; score: number | null; answers: Record<string, any> | null } | null>(null);
  useEffect(() => {
    if (!user) return;
    supabase.from("investor_profiles").select("completed_at, score, answers").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle().then(({ data }) => setMifid((data as any) ?? { completed_at: null, score: null, answers: null }));
  }, [user?.id]);
  // Recompute score from saved answers so the Settings card and the
  // questionnaire page can never disagree (even on legacy/corrupt rows).
  const recomputed = computeSuitability(mifid?.answers ?? null);
  const displayScore = mifid?.completed_at ? recomputed.score : (mifid?.score ?? null);
  return (
    <div className="space-y-6">
      <Card className="p-6 rounded-2xl">
        <h2 className="text-base font-semibold mb-2">Profile</h2>
        <p className="text-sm text-muted-foreground mb-4">Display name, avatar, phone, bio and date of birth live on the full profile page.</p>
        <Button asChild size="sm"><Link to="/profile">Open profile editor <ExternalLink className="h-3 w-3 ml-1.5" /></Link></Button>
      </Card>
      <Card className="p-6 rounded-2xl">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <h2 className="text-base font-semibold">MIFID suitability questionnaire</h2>
            <p className="text-sm text-muted-foreground">Required under MiFID II for investment advice and personalised recommendations.</p>
          </div>
          {mifid?.completed_at ? (
            <span className="text-[11px] rounded-full bg-success/10 text-success border border-success/30 px-2 py-0.5">Completed</span>
          ) : (
            <span className="text-[11px] rounded-full bg-warning/10 text-warning border border-warning/30 px-2 py-0.5">Not started</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mb-4">
          {mifid?.completed_at
            ? `Completed on ${new Date(mifid.completed_at).toLocaleDateString()} · Score ${displayScore ?? "-"} / ${recomputed.maxScore} · ${recomputed.profile.name} (SRI ${recomputed.sri}/7)`
            : "Takes around 5 minutes."}
        </div>
        <Button asChild size="sm" variant={mifid?.completed_at ? "outline" : "default"}>
          <Link to="/suitability">{mifid?.completed_at ? "Update questionnaire" : "Start questionnaire"} <ExternalLink className="h-3 w-3 ml-1.5" /></Link>
        </Button>
      </Card>
      <Card className="p-6 rounded-2xl">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <h2 className="text-base font-semibold">Product tour & onboarding</h2>
            <p className="text-sm text-muted-foreground">Replay the first-run journey — pick a ticker, see a Vela signal, and rediscover the core flow.</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={replayOnboarding} disabled={replaying}>
          {replaying ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5 mr-1.5" />}
          Replay onboarding
        </Button>
      </Card>
    </div>
  );
}

function FiscalResidencyTab() {
  const { user } = useAuth();
  const [residence, setResidence] = useState("");
  const [tax, setTax] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("country_residence, country_tax_residence").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      setResidence(data?.country_residence ?? ""); setTax(data?.country_tax_residence ?? "");
    });
  }, [user?.id]);
  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({ user_id: user.id, country_residence: residence, country_tax_residence: tax }, { onConflict: "user_id" });
    setSaving(false);
    if (error) toast.error("Could not save", { description: error.message }); else toast.success("Saved");
  };
  return (
    <Card className="p-6 rounded-2xl">
      <div className="flex items-start justify-between gap-3 mb-5">
        <h2 className="text-base font-semibold">Fiscal residency</h2>
        <span className="text-xs text-muted-foreground">single source of truth for tax calculations</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Country of residence (ISO-2)</Label>
          <Input value={residence} onChange={(e) => setResidence(e.target.value.toUpperCase())} maxLength={2} placeholder="IT" />
        </div>
        <div className="space-y-1.5">
          <Label>Country of tax residence (ISO-2)</Label>
          <Input value={tax} onChange={(e) => setTax(e.target.value.toUpperCase())} maxLength={2} placeholder="IT" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-4">
        Italian regime · Capital gains <strong className="text-foreground">26%</strong> · Losses carry forward 4 years (Art. 68 TUIR). IVAFE 0.2% on foreign holdings · Bollo titoli applies. This drives Portfolio, Tax and Net Worth calculations.
      </p>
      <Button size="sm" className="mt-5" onClick={save} disabled={saving}>{saving && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />} Save</Button>
    </Card>
  );
}

function CurrenciesTab({ baseCcy, setBaseCcy }: { baseCcy: string; setBaseCcy: (c: string) => void }) {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("base_currency").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data?.base_currency) setBaseCcy(data.base_currency);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  const pick = async (code: string) => {
    setBaseCcy(code);
    if (!user) return;
    const { error } = await supabase.from("profiles").upsert({ user_id: user.id, base_currency: code }, { onConflict: "user_id" });
    if (error) toast.error("Could not save", { description: error.message }); else toast.success(`Base currency set to ${code}`);
  };
  return (
    <Card className="p-6 rounded-2xl">
      <h2 className="text-base font-semibold mb-4">Base currency</h2>
      <div className="flex flex-wrap gap-2">
        {CURRENCIES.map((c) => {
          const active = c.code === baseCcy;
          return (
            <button
              key={c.code}
              onClick={() => pick(c.code)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${active ? "bg-foreground text-background border-foreground" : "bg-background text-foreground border-border hover:bg-muted/60"}`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-4">All portfolio totals and net-worth metrics are normalised to this currency.</p>
    </Card>
  );
}

function BrokersTab() {
  return (
    <div className="space-y-6">
      <BrokerSyncCard />
      <Card className="p-6 rounded-2xl">
        <h2 className="text-base font-semibold mb-1">How broker sync works</h2>
        <p className="text-sm text-muted-foreground">
          Vela uses SnapTrade to securely link Interactive Brokers, Trade Republic,
          Degiro, Schwab, Robinhood, Coinbase and 20+ more in <strong className="text-foreground">read-only</strong> mode.
          We never see your password and we cannot place trades on your behalf.
        </p>
      </Card>
    </div>
  );
}

function NotificationsTab() {
  const { user } = useAuth();
  const browserTz = typeof Intl !== "undefined"
    ? (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")
    : "UTC";
  const [prefs, setPrefs] = useState({
    email_enabled: true,
    daily_digest_enabled: true,
    immediate_only_critical: true,
    digest_hour_utc: 7,
    daily_brief_enabled: true,
    daily_brief_push: true,
    daily_brief_email: true,
    daily_brief_hour_local: 8,
    daily_brief_timezone: browserTz,
  });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) return;
    supabase.from("alert_preferences").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) setPrefs((prev) => ({
        ...prev,
        email_enabled: data.email_enabled,
        daily_digest_enabled: data.daily_digest_enabled,
        immediate_only_critical: data.immediate_only_critical,
        digest_hour_utc: data.digest_hour_utc,
        daily_brief_enabled: data.daily_brief_enabled ?? true,
        daily_brief_push: data.daily_brief_push ?? true,
        daily_brief_email: data.daily_brief_email ?? true,
        daily_brief_hour_local: data.daily_brief_hour_local ?? 8,
        daily_brief_timezone: data.daily_brief_timezone || browserTz,
      }));
      setLoading(false);
    });
  }, [user?.id]);
  const update = async (patch: Partial<typeof prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    if (!user) return;
    const { error } = await supabase.from("alert_preferences").upsert({ user_id: user.id, ...next }, { onConflict: "user_id" });
    if (error) toast.error("Could not save", { description: error.message });
  };
  return (
    <Card className="p-6 rounded-2xl">
      <h2 className="text-base font-semibold mb-1">Notifications</h2>
      <p className="text-sm text-muted-foreground mb-5">Control how Vela contacts you about alerts and digests.</p>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 p-4 space-y-3 bg-muted/20">
            <div className="flex items-center justify-between">
              <div>
                <Label>Daily market brief</Label>
                <p className="text-xs text-muted-foreground">A one-line morning brief on your portfolio and biggest mover. Free on every plan.</p>
              </div>
              <Switch checked={prefs.daily_brief_enabled} onCheckedChange={(v) => update({ daily_brief_enabled: v })} />
            </div>
            {prefs.daily_brief_enabled && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="flex items-center justify-between rounded-lg bg-background/60 px-3 py-2">
                  <Label className="text-xs">Push</Label>
                  <Switch checked={prefs.daily_brief_push} onCheckedChange={(v) => update({ daily_brief_push: v })} />
                </div>
                <div className="flex items-center justify-between rounded-lg bg-background/60 px-3 py-2">
                  <Label className="text-xs">Email</Label>
                  <Switch checked={prefs.daily_brief_email} onCheckedChange={(v) => update({ daily_brief_email: v })} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg bg-background/60 px-3 py-2 col-span-2">
                  <div>
                    <Label className="text-xs">Delivery hour (local)</Label>
                    <p className="text-[11px] text-muted-foreground">{prefs.daily_brief_timezone}</p>
                  </div>
                  <Input
                    type="number" min={0} max={23} className="w-20"
                    value={prefs.daily_brief_hour_local}
                    onChange={(e) => update({ daily_brief_hour_local: Math.max(0, Math.min(23, parseInt(e.target.value || "0", 10))) })}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div><Label>Email notifications</Label><p className="text-xs text-muted-foreground">Send triggered alerts to your inbox.</p></div>
            <Switch checked={prefs.email_enabled} onCheckedChange={(v) => update({ email_enabled: v })} />
          </div>
          <div className="flex items-center justify-between">
            <div><Label>Daily digest</Label><p className="text-xs text-muted-foreground">Morning summary of your portfolio and watchlist.</p></div>
            <Switch checked={prefs.daily_digest_enabled} onCheckedChange={(v) => update({ daily_digest_enabled: v })} />
          </div>
          <div className="flex items-center justify-between">
            <div><Label>Critical alerts only (immediate)</Label><p className="text-xs text-muted-foreground">Non-critical alerts roll into the daily digest.</p></div>
            <Switch checked={prefs.immediate_only_critical} onCheckedChange={(v) => update({ immediate_only_critical: v })} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div><Label>Digest hour (UTC)</Label><p className="text-xs text-muted-foreground">0–23. Defaults to 07:00 UTC.</p></div>
            <Input type="number" min={0} max={23} className="w-20" value={prefs.digest_hour_utc} onChange={(e) => update({ digest_hour_utc: Math.max(0, Math.min(23, parseInt(e.target.value || "0", 10))) })} />
          </div>
        </div>
      )}
    </Card>
  );
}

function PrivacyTab() {
  return (
    <div className="space-y-6">
      <AdvisoryAccessCard />
      <TenantLicensingCard />
      <Card className="p-6 rounded-2xl">
        <h2 className="text-base font-semibold mb-2">Privacy & data controls</h2>
        <p className="text-sm text-muted-foreground mb-4">Manage consent, marketing preferences, cookie categories and GDPR data rights.</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/privacy-settings">Open privacy centre <ExternalLink className="h-3 w-3 ml-1.5" /></Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/security">Security & 2FA <ExternalLink className="h-3 w-3 ml-1.5" /></Link></Button>
        </div>
      </Card>
    </div>
  );
}

function BillingTab({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const { user } = useAuth();
  const [trial, setTrial] = useState<{ ends_at: string | null; status: string | null; cycle: string | null } | null>(null);
  const location = useLocation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [canceling, setCanceling] = useState(false);
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("plan, trial_ends_at, subscription_status, billing_cycle")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const p: any = data;
        if (p?.plan === "pro_trial" || p?.subscription_status === "trialing") {
          setTrial({ ends_at: p.trial_ends_at ?? null, status: p.subscription_status ?? null, cycle: p.billing_cycle ?? null });
        }
      });
  }, [user?.id]);

  // Auto-open cancel dialog when user arrives from a "Cancel trial" link
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("cancel") === "1" && trial?.ends_at) setConfirmOpen(true);
  }, [location.search, trial?.ends_at]);

  const handleCancel = async () => {
    setCanceling(true);
    try {
      const { error } = await supabase.functions.invoke("cancel-trial");
      if (error) throw error;
      toast.success("Trial canceled. You're back on the Free plan — no charge was made.");
      setTrial(null);
      setConfirmOpen(false);
      setTimeout(() => window.location.reload(), 800);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not cancel trial");
    } finally {
      setCanceling(false);
    }
  };

  return (
    <div className="space-y-4">
      <PastDueBanner />
      <PaymentMethodCard />
      <Card className="p-6 rounded-2xl">
      <h2 className="text-base font-semibold mb-2">Subscription & billing</h2>
      <p className="text-sm text-muted-foreground mb-5">Manage your plan, download invoices, or cancel in the secure billing portal.</p>
      {trial?.ends_at && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <div className="font-semibold text-foreground text-base">Pro trial active</div>
          <div className="text-xs text-muted-foreground mt-1">
            First charge on <strong>{new Date(trial.ends_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</strong>
            {trial.cycle ? ` · ${trial.cycle === "annual" ? "€290/year" : "€29/month"}` : ""}. Cancel any time before then to avoid being charged.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
              disabled={canceling}
            >
              {canceling ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Canceling…</> : "Cancel trial"}
            </Button>
            <ManageSubscriptionButton size="sm" label="Manage or cancel trial" />
          </div>
          {confirmOpen && (
            <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <div className="text-sm font-semibold text-foreground">Cancel your trial now?</div>
              <p className="text-xs text-muted-foreground mt-1">
                Your Pro access will end immediately and no charge will be made. You can restart the trial anytime from the pricing page.
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="destructive" onClick={handleCancel} disabled={canceling}>
                  {canceling ? "Canceling…" : "Yes, cancel now"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmOpen(false)} disabled={canceling}>
                  Keep my trial
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <ManageSubscriptionButton size="sm" />
        <Button size="sm" onClick={() => navigate("/upgrade")} className="gap-1.5">
          <ExternalLink className="h-3.5 w-3.5" /> Upgrade or change plan
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate("/pricing")}>View plans</Button>
      </div>
      <p className="text-xs text-muted-foreground mt-4">Opens in a new tab. Changes sync back to your account within seconds.</p>
      </Card>
    </div>
  );
}

const Settings = () => {
  const [tab, setTab] = useState<Tab>("Profile");
  const [baseCcy, setBaseCcy] = useState("EUR");
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, setMode } = useTheme();

  useEffect(() => {
    const rawTab = new URLSearchParams(location.search).get("tab");
    const hashTab = location.hash.replace(/^#/, "");
    const requested = rawTab || hashTab;
    if (!requested) return;
    const normalized = requested.toLowerCase().replace(/[-_]/g, " ");
    const match = TABS.find(({ id }) => id.toLowerCase() === normalized || (!rawTab && normalized === "ai" && id === "Connections"));
    if (match) setTab(match.id);
  }, [location.search, location.hash]);

  return (
    <div className="p-4 sm:p-8 space-y-6 min-w-0">
      <SEO title="Settings - Account, Preferences & Integrations" description="Manage your account, fiscal residency, currencies, broker connections and data." path="/settings" />
      <PageHeader
        icon={SettingsIcon}
        title="Settings"
        description="Account, fiscal residency, currency, broker links, notifications and data."
        actions={
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" /> Export all data
          </Button>
        }
      />

      <Card className="glass-card p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Appearance</p>
          <p className="text-xs text-muted-foreground">Choose how Vela looks. Matches the landing page when set to dark.</p>
        </div>
        <div className="sm:ml-auto inline-flex rounded-lg border border-border bg-card p-1">
          {([
            { id: "light", label: "Light", icon: Sun },
            { id: "dark", label: "Dark", icon: Moon },
            { id: "system", label: "System", icon: Monitor },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${mode === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              aria-pressed={mode === id}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid lg:grid-cols-[240px_1fr] gap-6 items-start">
        {/* Left nav */}
        <Card className="p-3 rounded-2xl">
          <nav className="flex flex-col gap-1">
            {TABS.map(({ id, icon: Icon }) => {
              const active = id === tab;
              return (
                <button
                  key={id}
                  onClick={() => {
                    setTab(id);
                    navigate(`/settings?tab=${encodeURIComponent(id)}`, { replace: true });
                  }}
                  className={`text-left text-sm px-3 py-2 rounded-lg transition-colors flex items-center gap-2 ${active ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:bg-muted/60"}`}
                >
                  <Icon className="h-4 w-4" /> {id}
                </button>
              );
            })}
          </nav>
        </Card>

        {/* Right column */}
        <div className="space-y-6">
          {tab === "Profile" && <ProfileTab />}
          {tab === "Fiscal residency" && <FiscalResidencyTab />}
          {tab === "Currencies" && <CurrenciesTab baseCcy={baseCcy} setBaseCcy={setBaseCcy} />}
          {tab === "Broker connections" && <BrokersTab />}
          {tab === "Notifications" && <NotificationsTab />}
          {tab === "Connections" && <ConnectionsCard />}
          {tab === "AI" && (
            <div className="space-y-6">
              <AIAccessCard />
              <AdvisorTogglesCard />
            </div>
          )}
          {tab === "Privacy & data" && <PrivacyTab />}
          {tab === "Billing" && <BillingTab navigate={navigate} />}
          {tab === "Support" && <SupportCard />}
        </div>
      </div>
    </div>
  );
};

export default Settings;
