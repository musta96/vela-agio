import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ShieldCheck, KeyRound, Smartphone, Loader2, MailCheck, LogOut, Trash2 } from "lucide-react";
import { SEO } from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function Security() {
  const { user } = useAuth();
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [email, setEmail] = useState(user?.email ?? "");
  const [savingEmail, setSavingEmail] = useState(false);
  const [factors, setFactors] = useState<any[]>([]);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const loadFactors = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(data?.totp ?? []);
  };
  useEffect(() => { loadFactors(); }, []);
  useEffect(() => { setEmail(user?.email ?? ""); }, [user?.email]);

  const changePassword = async () => {
    if (pw.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (pw !== pw2) { toast.error("Passwords do not match"); return; }
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSavingPw(false);
    if (error) toast.error("Could not change password", { description: error.message });
    else { toast.success("Password updated"); setPw(""); setPw2(""); }
  };

  const changeEmail = async () => {
    if (!email || email === user?.email) return;
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email });
    setSavingEmail(false);
    if (error) toast.error("Could not change email", { description: error.message });
    else toast.success("Confirmation sent", { description: "Check both old and new inboxes." });
  };

  const resendVerification = async () => {
    if (!user?.email) return;
    const { error } = await supabase.auth.resend({ type: "signup", email: user.email });
    if (error) toast.error(error.message); else toast.success("Verification email sent");
  };

  const startEnroll = async () => {
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setBusy(false);
    if (error || !data) { toast.error("Could not start enrolment", { description: error?.message }); return; }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const verifyEnroll = async () => {
    if (!enroll) return;
    setBusy(true);
    const challenge = await supabase.auth.mfa.challenge({ factorId: enroll.id });
    if (challenge.error || !challenge.data) { setBusy(false); toast.error("Challenge failed", { description: challenge.error?.message }); return; }
    const { error } = await supabase.auth.mfa.verify({ factorId: enroll.id, challengeId: challenge.data.id, code });
    setBusy(false);
    if (error) { toast.error("Invalid code", { description: error.message }); return; }
    toast.success("2FA enabled");
    setEnroll(null); setCode(""); loadFactors();
  };

  const removeFactor = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("Factor removed"); loadFactors(); }
  };

  const signOutEverywhere = async () => {
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) toast.error(error.message); else toast.success("Signed out from all sessions");
  };

  const verified = factors.filter((f) => f.status === "verified");
  const emailConfirmed = !!user?.email_confirmed_at;

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Security · Vela" description="Change password, manage two-factor authentication and active sessions." path="/security" />
      <main className="container mx-auto px-4 py-6 space-y-5 max-w-3xl">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><ShieldCheck className="h-6 w-6" /> Security</h1>
          <p className="text-sm text-muted-foreground">Account credentials and authentication.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><MailCheck className="h-4 w-4" /> Email</CardTitle>
            <CardDescription>{emailConfirmed ? <Badge variant="default" className="bg-success/15 text-success">Verified</Badge> : <Badge variant="outline">Not verified</Badge>}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
              <Button variant="outline" onClick={changeEmail} disabled={savingEmail || email === user?.email}>{savingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update</Button>
            </div>
            {!emailConfirmed && (
              <Button variant="ghost" size="sm" onClick={resendVerification}>Resend verification email</Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" /> Password</CardTitle>
            <CardDescription>Use at least 8 characters with a mix of letters and numbers.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>New password</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Confirm</Label><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
            <div className="sm:col-span-2"><Button onClick={changePassword} disabled={savingPw || !pw}>{savingPw && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Change password</Button></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Smartphone className="h-4 w-4" /> Two-factor authentication (TOTP)</CardTitle>
            <CardDescription>Use Google Authenticator, 1Password or any TOTP app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {verified.length > 0 && (
              <div className="space-y-2">
                {verified.map((f) => (
                  <div key={f.id} className="flex items-center justify-between rounded-md border border-border bg-card/40 p-3">
                    <div>
                      <div className="text-sm font-medium">{f.friendly_name || "Authenticator"}</div>
                      <div className="text-xs text-muted-foreground">Added {new Date(f.created_at).toLocaleDateString()}</div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeFactor(f.id)} disabled={busy}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            )}

            {!enroll && (
              <Button onClick={startEnroll} disabled={busy} variant={verified.length > 0 ? "outline" : "default"}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{verified.length > 0 ? "Add another factor" : "Enable 2FA"}
              </Button>
            )}

            {enroll && (
              <div className="rounded-md border border-border bg-card/40 p-4 space-y-3">
                <div className="text-sm">Scan this QR with your authenticator app, then enter the 6-digit code:</div>
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  <img src={enroll.qr} alt="TOTP QR" className="h-40 w-40 rounded bg-white p-2" />
                  <div className="space-y-2 flex-1">
                    <div>
                      <Label className="text-xs">Or enter this secret manually</Label>
                      <code className="block rounded bg-muted px-2 py-1 text-xs font-mono break-all">{enroll.secret}</code>
                    </div>
                    <div>
                      <Label>6-digit code</Label>
                      <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={verifyEnroll} disabled={busy || code.length !== 6}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verify &amp; enable</Button>
                      <Button variant="ghost" onClick={() => { setEnroll(null); setCode(""); }}>Cancel</Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <Separator />
            <p className="text-xs text-muted-foreground">
              Passkeys / WebAuthn are on the roadmap. For now, TOTP gives you strong second-factor protection.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><LogOut className="h-4 w-4" /> Active sessions</CardTitle>
            <CardDescription>Sign out from every device where this account is logged in.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={signOutEverywhere}>Sign out everywhere</Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}