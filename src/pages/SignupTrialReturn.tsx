import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Calendar, CreditCard, XCircle } from "lucide-react";
import VelaLogo from "@/components/VelaLogo";
import { SEO } from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { trackSignupEvent } from "@/lib/signupAnalytics";

type Draft = {
  email: string;
  password: string;
  cycle: "monthly" | "annual";
  sessionId: string;
  trialEndDate: string | null;
  consent: { ackTerms: boolean; ackNotAdvice: boolean; ackRisk: boolean; marketingOptIn: boolean };
};

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "your trial end date";
}

export default function SignupTrialReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = params.get("session_id");
  const [status, setStatus] = useState<"working" | "success" | "error">("working");
  const [error, setError] = useState<string>("");
  const [canRetryCard, setCanRetryCard] = useState(false);
  const [declineCode, setDeclineCode] = useState<string | null>(null);
  const [result, setResult] = useState<{ trialEndsAt: string | null; amount: string; billingCycle: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = sessionStorage.getItem("vela.trialSignup");
        if (!raw) throw new Error("Missing signup context. Please restart the trial signup.");
        const draft = JSON.parse(raw) as Draft;
        if (!sessionId || draft.sessionId !== sessionId) throw new Error("Checkout session mismatch. Please restart the trial signup.");

        const { data, error } = await supabase.functions.invoke("finalize-trial-signup", {
          body: {
            sessionId,
            email: draft.email,
            password: draft.password,
            billingCycle: draft.cycle,
            environment: getStripeEnvironment(),
            consent: draft.consent,
          },
        });
        // Handle 402/decline responses distinctly so we can surface the
        // specific reason and keep the user on the flow (no account was
        // created — they can retry with a different card).
        const respData: any = data ?? {};
        if (respData?.canRetryWithNewCard || respData?.declineCode) {
          const reason: string = respData.declineReason || respData.error || "Card was declined.";
          if (!cancelled) {
            setDeclineCode(respData.declineCode ?? null);
            setCanRetryCard(true);
            setError(reason);
            setStatus("error");
            trackSignupEvent("trial_signup_failed", {
              reason: "card_declined",
              decline_code: respData.declineCode ?? null,
            });
          }
          return;
        }
        if (error) throw new Error(error.message);
        if (!data?.ok) throw new Error(data?.error ?? "Signup failed");

        // Log the user in — the account was just created.
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email: draft.email, password: draft.password });
        if (signInErr) throw new Error(signInErr.message);

        sessionStorage.removeItem("vela.trialSignup");
        void trackSignupEvent("trial_signup_completed", {
          billing_cycle: data.billingCycle,
        });
        if (cancelled) return;
        setResult({ trialEndsAt: data.trialEndsAt, amount: data.amount, billingCycle: data.billingCycle });
        setStatus("success");
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message);
        setStatus("error");
        void trackSignupEvent("trial_signup_failed", { reason: "unknown", message: (e as Error).message });
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <SEO title="Your Pro trial is active — Vela.ai" description="Your Vela Pro trial is now active." path="/signup/trial/return" />
      <main className="w-full max-w-xl mx-auto">
        <Link to="/" className="flex items-center justify-center mb-6"><VelaLogo size={32} /></Link>
        <Card className="p-6 card-gradient border-border">
          {status === "working" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Setting up your Pro trial…</p>
            </div>
          )}
          {status === "success" && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <div>
                  <h1 className="text-xl font-bold">You're in — welcome to Vela Pro</h1>
                  <p className="text-sm text-muted-foreground">Full Pro access is active on your account right now.</p>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 mt-0.5 text-primary" />
                  <div>
                    <div className="font-semibold">First charge on {formatDate(result.trialEndsAt)}</div>
                    <div className="text-xs text-muted-foreground">Nothing is charged before then. If you cancel by that date, you won't be billed.</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CreditCard className="h-4 w-4 mt-0.5 text-primary" />
                  <div>
                    <div className="font-semibold">{result.amount}</div>
                    <div className="text-xs text-muted-foreground capitalize">Billing cycle: {result.billingCycle}</div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                A confirmation email is on its way. You can manage or cancel your trial any time from <Link to="/settings?tab=billing" className="text-primary hover:underline font-medium">Settings → Billing</Link>.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button className="flex-1" onClick={() => navigate("/onboarding?flow=trial")}>Start onboarding</Button>
                <Button variant="outline" onClick={() => navigate("/settings?tab=billing")}>Manage or cancel trial</Button>
              </div>
            </div>
          )}
          {status === "error" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <XCircle className="h-8 w-8 text-destructive" />
                <div>
                  <h1 className="text-xl font-bold">
                    {canRetryCard ? "Your card couldn't be validated" : "We couldn't finish your signup"}
                  </h1>
                  <p className="text-sm text-muted-foreground">{error}</p>
                  {canRetryCard && (
                    <p className="text-xs text-muted-foreground mt-2">
                      No account was created and no charge was made. You can try again with a different card
                      {declineCode ? ` (reason: ${declineCode})` : ""}.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => navigate(canRetryCard ? "/signup/trial?resume=1" : "/signup/trial")}
                >
                  {canRetryCard ? "Try a different card" : "Try again"}
                </Button>
                <Button variant="outline" onClick={() => navigate("/auth")}>Sign in instead</Button>
              </div>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}