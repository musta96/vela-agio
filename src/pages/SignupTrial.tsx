import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { Loader2, ArrowLeft, ArrowRight, CheckCircle2, ShieldCheck, CreditCard, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import VelaLogo from "@/components/VelaLogo";
import { SEO } from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

type Cycle = "monthly" | "annual";

const MONTHLY_PRICE = 29;
const ANNUAL_PRICE = 290;
const ANNUAL_PER_MONTH = ANNUAL_PRICE / 12;
const ANNUAL_SAVINGS_PCT = Math.round((1 - ANNUAL_PER_MONTH / MONTHLY_PRICE) * 100);

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export default function SignupTrial() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [params] = useSearchParams();

  const initialCycle = (params.get("cycle") === "annual" ? "annual" : "monthly") as Cycle;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cycle, setCycle] = useState<Cycle>(initialCycle);
  const [ackTerms, setAckTerms] = useState(false);
  const [ackNotAdvice, setAckNotAdvice] = useState(false);
  const [ackRisk, setAckRisk] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [busy, setBusy] = useState(false);

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [trialEndDate, setTrialEndDate] = useState<string | null>(null);
  const [trialDays, setTrialDays] = useState<number>(7);

  useEffect(() => {
    if (!authLoading && user) navigate("/dashboard", { replace: true });
  }, [user, authLoading, navigate]);

  // Persist details across the checkout iframe → return page hop.
  useEffect(() => {
    if (email && password && cycle && sessionId) {
      sessionStorage.setItem("vela.trialSignup", JSON.stringify({
        email, password, cycle, sessionId, trialEndDate,
        consent: { ackTerms, ackNotAdvice, ackRisk, marketingOptIn },
      }));
    }
  }, [email, password, cycle, sessionId, trialEndDate, ackTerms, ackNotAdvice, ackRisk, marketingOptIn]);

  const acceptLegal = ackTerms && ackNotAdvice && ackRisk;
  const canSubmitStep1 = email && password.length >= 6 && acceptLegal;

  const priceId = cycle === "annual" ? "pro_annual" : "pro_monthly";
  const cycleAmount = cycle === "annual" ? "€290 billed annually" : "€29 billed monthly";
  const cyclePerMonth = cycle === "annual" ? `€${ANNUAL_PER_MONTH.toFixed(2)}/mo equivalent` : "€29/mo";

  const startCheckout = async () => {
    setBusy(true);
    try {
      const returnUrl = `${window.location.origin}/signup/trial/return?session_id={CHECKOUT_SESSION_ID}`;
      const { data, error } = await supabase.functions.invoke("create-trial-checkout", {
        body: { email, priceId, returnUrl, environment: getStripeEnvironment() },
      });
      if (error) throw new Error(error.message);
      if (!data?.clientSecret) throw new Error(data?.error ?? "Failed to start checkout");
      setClientSecret(data.clientSecret);
      setSessionId(data.sessionId);
      setTrialEndDate(data.trialEndDate);
      setTrialDays(data.trialDays ?? 7);
      setStep(3);
    } catch (e) {
      toast({ title: "Could not start trial", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const checkoutOptions = useMemo(() => ({ fetchClientSecret: async () => clientSecret! }), [clientSecret]);

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <SEO title="Start your 7-day Pro trial — Vela.ai" description="Try Vela Pro free for 7 days. Full access to AI signals, backtesting, and portfolio analytics. No charge until your trial ends." path="/signup/trial" />
      <main className="w-full max-w-2xl mx-auto">
        <Link to="/" className="flex items-center justify-center mb-6"><VelaLogo size={32} /></Link>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 mb-6 text-xs text-muted-foreground">
          {[
            { n: 1, label: "Account" },
            { n: 2, label: "Billing cycle" },
            { n: 3, label: "Card details" },
          ].map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              <span className={`h-6 w-6 rounded-full grid place-items-center text-[11px] font-semibold ${step >= s.n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {step > s.n ? <CheckCircle2 className="h-4 w-4" /> : s.n}
              </span>
              <span className={step === s.n ? "font-semibold text-foreground" : ""}>{s.label}</span>
              {i < 2 && <span className="h-px w-6 bg-border" />}
            </div>
          ))}
        </div>

        <h1 className="text-2xl md:text-3xl font-bold text-center mb-2">Start your {trialDays}-day Pro trial</h1>
        <p className="text-sm text-center text-muted-foreground mb-6">Full Pro access from day one. Cancel any time before your trial ends and you won't be charged.</p>

        <Card className="p-6 card-gradient border-border">
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="tr-email">Email</Label>
                <Input id="tr-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tr-pw">Password</Label>
                <Input id="tr-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <p className="text-xs text-muted-foreground">At least 6 characters.</p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Required acknowledgements</p>
                <label className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                  <Checkbox checked={ackTerms} onCheckedChange={(v) => setAckTerms(v === true)} className="mt-0.5" />
                  <span>I agree to the <Link to="/terms" target="_blank" className="text-primary hover:underline">Terms</Link>, <Link to="/privacy" target="_blank" className="text-primary hover:underline">Privacy</Link> and <Link to="/disclaimer" target="_blank" className="text-primary hover:underline">Disclaimer</Link>.</span>
                </label>
                <label className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                  <Checkbox checked={ackNotAdvice} onCheckedChange={(v) => setAckNotAdvice(v === true)} className="mt-0.5" />
                  <span>Vela.ai is an <strong>educational research platform only</strong>. Nothing on the platform constitutes investment advice.</span>
                </label>
                <label className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                  <Checkbox checked={ackRisk} onCheckedChange={(v) => setAckRisk(v === true)} className="mt-0.5" />
                  <span>Trading carries the risk of loss. I accept full responsibility for decisions I make.</span>
                </label>
              </div>
              <label className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                <Checkbox checked={marketingOptIn} onCheckedChange={(v) => setMarketingOptIn(v === true)} className="mt-0.5" />
                <span>Send me occasional product updates. (Optional.)</span>
              </label>
              <Button className="w-full" disabled={!canSubmitStep1} onClick={() => setStep(2)}>
                Continue <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Already have an account? <Link to="/auth" className="text-primary hover:underline">Sign in</Link>
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <ShieldCheck className="inline h-4 w-4 mr-1 text-emerald-500" />
                Your {trialDays}-day free trial applies regardless of the cycle you choose.
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setCycle("monthly")}
                  className={`text-left rounded-xl border p-4 transition ${cycle === "monthly" ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border hover:border-primary/40"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">Monthly</div>
                    {cycle === "monthly" && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="mt-2 text-2xl font-extrabold">€29<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
                  <div className="text-xs text-muted-foreground mt-1">Billed monthly. Cancel any time.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setCycle("annual")}
                  className={`text-left rounded-xl border p-4 transition relative ${cycle === "annual" ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border hover:border-primary/40"}`}
                >
                  <div className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-100 rounded px-1.5 py-0.5">
                    Save {ANNUAL_SAVINGS_PCT}%
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">Annual</div>
                    {cycle === "annual" && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="mt-2 text-2xl font-extrabold">€{ANNUAL_PER_MONTH.toFixed(2)}<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
                  <div className="text-xs text-muted-foreground mt-1">€{ANNUAL_PRICE} billed once a year (~2 months free).</div>
                </button>
              </div>
              <div className="rounded-md bg-muted/40 border border-border p-3 text-xs text-muted-foreground flex items-start gap-2">
                <Calendar className="h-4 w-4 mt-0.5 text-primary" />
                <span>You won't be charged until <strong>{formatDate(new Date(Date.now() + trialDays * 86400000).toISOString())}</strong>. If you cancel before then, nothing is charged.</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)} disabled={busy}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
                <Button className="flex-1" onClick={startCheckout} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue to card details <ArrowRight className="ml-1 h-4 w-4" /></>}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && clientSecret && (
            <div className="space-y-4">
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                <div className="flex items-start gap-2 text-emerald-700 dark:text-emerald-300">
                  <CreditCard className="h-4 w-4 mt-0.5" />
                  <div>
                    <div className="font-semibold">You won't be charged until {trialEndDate ? formatDate(trialEndDate) : "your trial ends"}.</div>
                    <div className="text-xs mt-0.5 opacity-90">Then {cycleAmount} ({cyclePerMonth}). We validate your card with a small authorization hold — no charge is made now. Cancel any time before then.</div>
                  </div>
                </div>
              </div>
              <div id="checkout" className="rounded-lg overflow-hidden border border-border">
                <EmbeddedCheckoutProvider stripe={getStripe()} options={checkoutOptions}>
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
              </div>
              <Button variant="ghost" onClick={() => { setClientSecret(null); setStep(2); }}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Change billing cycle
              </Button>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}