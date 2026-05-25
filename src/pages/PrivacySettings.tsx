import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Download, Trash2, Cookie, Shield, ScrollText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { SEO } from "@/components/SEO";
import { CONSENT_EVENTS } from "@/lib/consent";
import { TOS_VERSION, PRIVACY_VERSION } from "@/lib/legal-versions";

interface ConsentRow {
  id: string;
  tos_version: string;
  privacy_version: string;
  marketing_opt_in: boolean;
  accepted_at: string;
}

const PrivacySettings = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [consents, setConsents] = useState<ConsentRow[]>([]);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_consents")
      .select("id, tos_version, privacy_version, marketing_opt_in, accepted_at")
      .order("accepted_at", { ascending: false })
      .then(({ data }) => setConsents(data ?? []));
  }, [user]);

  const latest = consents[0];
  const tosOutdated = latest && latest.tos_version !== TOS_VERSION;
  const privacyOutdated = latest && latest.privacy_version !== PRIVACY_VERSION;

  const downloadData = async () => {
    setExporting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/export-user-data`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `vela-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast({ title: "Export ready", description: "Your data has been downloaded." });
    } catch (e) {
      toast({ title: "Export failed", description: String((e as Error)?.message ?? e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke("delete-account", {
        body: { confirm: confirmText },
      });
      if (error) throw error;
      await supabase.auth.signOut();
      toast({ title: "Account deleted", description: "All your data has been removed." });
      navigate("/auth");
    } catch (e) {
      toast({ title: "Deletion failed", description: String((e as Error)?.message ?? e), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const reaccept = async () => {
    if (!user) return;
    const { error } = await supabase.from("user_consents").insert({
      user_id: user.id,
      tos_version: TOS_VERSION,
      privacy_version: PRIVACY_VERSION,
      marketing_opt_in: latest?.marketing_opt_in ?? false,
      user_agent: navigator.userAgent,
    });
    if (error) return toast({ title: "Could not record consent", description: error.message, variant: "destructive" });
    toast({ title: "Thanks", description: "Your acceptance has been recorded." });
    const { data } = await supabase
      .from("user_consents")
      .select("id, tos_version, privacy_version, marketing_opt_in, accepted_at")
      .order("accepted_at", { ascending: false });
    setConsents(data ?? []);
  };

  if (loading || !user) return null;

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <SEO title="Privacy & Data — Vela.ai" description="Manage cookies, export your data, and delete your account." path="/privacy-settings" />

      <div>
        <h1 className="text-2xl font-bold">Privacy & data</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your rights under GDPR (EU) and similar laws. Manage what we store, export everything, or delete your account.
        </p>
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Legal acceptance</h2>
        </div>
        {latest ? (
          <div className="text-sm text-muted-foreground space-y-1">
            <div>Terms accepted: <Badge variant={tosOutdated ? "destructive" : "secondary"}>v{latest.tos_version}</Badge> {tosOutdated && <span className="ml-1 text-destructive">(current: v{TOS_VERSION})</span>}</div>
            <div>Privacy accepted: <Badge variant={privacyOutdated ? "destructive" : "secondary"}>v{latest.privacy_version}</Badge> {privacyOutdated && <span className="ml-1 text-destructive">(current: v{PRIVACY_VERSION})</span>}</div>
            <div>Marketing emails: <Badge variant="outline">{latest.marketing_opt_in ? "opted in" : "opted out"}</Badge></div>
            <div className="text-xs">Last update: {new Date(latest.accepted_at).toLocaleString()}</div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No consent record on file yet.</p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" asChild><Link to="/terms" target="_blank">Read Terms</Link></Button>
          <Button variant="outline" size="sm" asChild><Link to="/privacy" target="_blank">Read Privacy Policy</Link></Button>
          {(tosOutdated || privacyOutdated || !latest) && (
            <Button size="sm" onClick={reaccept}>Re-accept current versions</Button>
          )}
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Cookie className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Cookie preferences</h2>
        </div>
        <p className="text-sm text-muted-foreground">Change which categories of cookies Vela.ai may use.</p>
        <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new Event(CONSENT_EVENTS.OPEN_EVENT))}>
          Open cookie settings
        </Button>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Download className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Download your data</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          GDPR Article 20 — get a copy of everything we store about you in JSON.
          Encrypted broker credentials are excluded for security.
        </p>
        <Button onClick={downloadData} disabled={exporting} className="gap-2">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? "Preparing export…" : "Download my data (JSON)"}
        </Button>
      </Card>

      <Card className="p-5 space-y-3 border-destructive/40">
        <div className="flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-destructive" />
          <h2 className="font-semibold text-destructive">Delete account</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Permanently delete your account and all associated data: portfolios, watchlists, alerts,
          notifications, broker connections, and your profile. This cannot be undone.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="gap-2">
              <Trash2 className="h-4 w-4" /> Delete my account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your Vela.ai account?</AlertDialogTitle>
              <AlertDialogDescription>
                This wipes every row tied to your user across all tables and removes your sign-in.
                You will not be able to recover any data afterwards.
                <br /><br />
                Type <b>DELETE</b> below to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-2">
              <Label htmlFor="confirm-del" className="sr-only">Confirm</Label>
              <Input id="confirm-del" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="Type DELETE" />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={confirmText.trim().toUpperCase() !== "DELETE" || deleting}
                onClick={(e) => { e.preventDefault(); deleteAccount(); }}
                className="bg-destructive hover:bg-destructive/90"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete permanently"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>

      <Card className="p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Other rights</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          For rectification, restriction of processing, objection, or to lodge a complaint with your
          supervisory authority (Italy: Garante per la protezione dei dati personali), contact us via
          the email listed in our <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
        </p>
      </Card>
    </div>
  );
};

export default PrivacySettings;