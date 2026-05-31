import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Activity, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { SEO } from "@/components/SEO";
import { TOS_VERSION, PRIVACY_VERSION } from "@/lib/legal-versions";

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [ackTerms, setAckTerms] = useState(false);
  const [ackNotAdvice, setAckNotAdvice] = useState(false);
  const [ackRisk, setAckRisk] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const acceptLegal = ackTerms && ackNotAdvice && ackRisk;

  useEffect(() => {
    if (!loading && user) navigate("/dashboard");
  }, [user, loading, navigate]);

  const signIn = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast({ title: "Sign in failed", description: error.message, variant: "destructive" });
    toast({ title: "Welcome back" });
    navigate("/dashboard");
  };

  const signUp = async () => {
    if (!acceptLegal) {
      return toast({
        title: "Please accept all required acknowledgements",
        description: "All three legal checkboxes must be ticked before creating an account.",
        variant: "destructive",
      });
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          tos_version: TOS_VERSION,
          privacy_version: PRIVACY_VERSION,
          marketing_opt_in: marketingOptIn,
          ack_terms: ackTerms,
          ack_not_advice: ackNotAdvice,
          ack_risk: ackRisk,
          consented_at: new Date().toISOString(),
        },
      },
    });
    setBusy(false);
    if (error) return toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
    // Best-effort consent log. Will succeed once the user is authenticated
    // (either immediately if email confirmation is off, or on first sign-in).
    if (data.user) {
      void supabase.from("user_consents").insert({
        user_id: data.user.id,
        tos_version: TOS_VERSION,
        privacy_version: PRIVACY_VERSION,
        marketing_opt_in: marketingOptIn,
        user_agent: navigator.userAgent,
      });
    }
    toast({ title: "Check your email", description: "We sent you a confirmation link." });
  };

  const googleSignIn = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast({ title: "Google sign-in failed", description: String(result.error?.message || result.error), variant: "destructive" });
      return;
    }
    if (result.redirected) return;
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <SEO
        title="Sign In or Create Account — Vela.ai"
        description="Sign in or create your Vela.ai account to save watchlists, portfolios, and access AI-powered trading insights."
        path="/auth"
      />
      <main className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-8">
          <Activity className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold text-gradient">Vela.ai</span>
        </Link>
        <h1 className="text-2xl font-bold text-center mb-4">Sign in to Vela.ai</h1>
        <Card className="p-6 card-gradient border-border">
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="se">Email</Label>
                <Input id="se" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sp">Password</Label>
                <Input id="sp" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </div>
              <Button onClick={signIn} disabled={busy || !email || !password} className="w-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
              </Button>
            </TabsContent>

            <TabsContent value="signup" className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="ue">Email</Label>
                <Input id="ue" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="up">Password</Label>
                <Input id="up" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                <p className="text-xs text-muted-foreground">At least 6 characters.</p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Required legal acknowledgements</p>
                <div className="flex items-start gap-2">
                  <Checkbox id="ack-terms" checked={ackTerms} onCheckedChange={(v) => setAckTerms(v === true)} className="mt-0.5" />
                  <Label htmlFor="ack-terms" className="text-xs font-normal leading-relaxed text-muted-foreground">
                    I have read and agree to the{" "}
                    <Link to="/terms" target="_blank" className="text-primary hover:underline">Terms of Service</Link>,{" "}
                    <Link to="/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</Link>,{" "}
                    <Link to="/cookies" target="_blank" className="text-primary hover:underline">Cookie Policy</Link> and{" "}
                    <Link to="/disclaimer" target="_blank" className="text-primary hover:underline">Disclaimer</Link>.
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox id="ack-advice" checked={ackNotAdvice} onCheckedChange={(v) => setAckNotAdvice(v === true)} className="mt-0.5" />
                  <Label htmlFor="ack-advice" className="text-xs font-normal leading-relaxed text-muted-foreground">
                    I understand Vela.ai is an <strong>educational research platform only</strong>. Nothing on the platform — including AI outputs, scores, alerts, suggestions, optimizer results, backtests or copilot responses — constitutes investment, legal, accounting or tax advice.
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox id="ack-risk" checked={ackRisk} onCheckedChange={(v) => setAckRisk(v === true)} className="mt-0.5" />
                  <Label htmlFor="ack-risk" className="text-xs font-normal leading-relaxed text-muted-foreground">
                    I understand trading and investing carry the risk of partial or total loss; past performance is not indicative of future results; data may be delayed or inaccurate; and I accept <strong>full and sole responsibility</strong> for any decisions or actions I take using this platform. I release Vela.ai and its operators from any liability to the maximum extent permitted by law.
                  </Label>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox id="mkt" checked={marketingOptIn} onCheckedChange={(v) => setMarketingOptIn(v === true)} className="mt-0.5" />
                <Label htmlFor="mkt" className="text-xs font-normal leading-relaxed text-muted-foreground">
                  Send me product updates and educational content by email. (Optional, you can unsubscribe anytime.)
                </Label>
              </div>
              <Button onClick={signUp} disabled={busy || !email || password.length < 6 || !acceptLegal} className="w-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
              </Button>
            </TabsContent>
          </Tabs>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <Button variant="outline" onClick={googleSignIn} disabled={busy} className="w-full gap-2">
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4.2-5.5 4.2-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.6 14.6 2.6 12 2.6 6.9 2.6 2.7 6.7 2.7 11.9s4.2 9.3 9.3 9.3c5.4 0 8.9-3.8 8.9-9.1 0-.6-.1-1.1-.2-1.6H12z"/>
            </svg>
            Continue with Google
          </Button>
        </Card>
      </main>
    </div>
  );
};

export default Auth;
