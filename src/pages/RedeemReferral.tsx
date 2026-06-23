import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { SEO } from "@/components/SEO";

const STORAGE_KEY = "vela.pending_referral";

export function rememberReferral(code: string) {
  try { sessionStorage.setItem(STORAGE_KEY, code); localStorage.setItem(STORAGE_KEY, code); } catch {}
}
export function consumePendingReferral(): string | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY); localStorage.removeItem(STORAGE_KEY);
    return v;
  } catch { return null; }
}

export default function RedeemReferral() {
  const { code: paramCode } = useParams();
  const [search] = useSearchParams();
  const code = (paramCode || search.get("code") || "").trim();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<"idle"|"working"|"ok"|"err">("idle");
  const [msg, setMsg] = useState<string>("");
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!code) { setState("err"); setMsg("No referral code provided."); return; }
    if (authLoading) return;
    if (!user) {
      rememberReferral(code);
      navigate(`/auth?ref=${encodeURIComponent(code)}`, { replace: true });
      return;
    }
    (async () => {
      setState("working");
      const { data, error } = await supabase.rpc("redeem_referral_code" as any, { _code: code });
      if (error) { setState("err"); setMsg(error.message); return; }
      setResult(data);
      setState("ok");
    })();
  }, [code, user, authLoading, navigate]);

  return (
    <div className="min-h-screen grid place-items-center px-4 bg-background">
      <SEO title="Redeem referral · Vela.ai" description="Redeem your referral code" path="/r" />
      <Card className="p-8 max-w-md w-full text-center space-y-4">
        <h1 className="text-xl font-bold">Referral code</h1>
        <p className="text-sm text-muted-foreground font-mono">{code || "—"}</p>
        {state === "working" && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Applying your code…
          </div>
        )}
        {state === "ok" && (
          <>
            <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
            <p className="text-sm">
              {result?.kind === "beta"
                ? "You're in! Beta tester access has been unlocked — every paid feature is now free for you."
                : result?.percent_off
                  ? `Code applied. ${result.percent_off}% off will be applied at checkout.`
                  : "Code applied."}
            </p>
            <div className="flex gap-2 justify-center">
              <Button asChild><Link to="/dashboard">Go to dashboard</Link></Button>
              {result?.kind !== "beta" && (
                <Button asChild variant="outline"><Link to={`/pricing?ref=${encodeURIComponent(code)}`}>See pricing</Link></Button>
              )}
            </div>
          </>
        )}
        {state === "err" && (
          <>
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <p className="text-sm text-destructive">{msg}</p>
            <Button asChild variant="outline"><Link to="/">Back home</Link></Button>
          </>
        )}
      </Card>
    </div>
  );
}