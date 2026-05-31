import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Building2, RefreshCw, Loader2, ExternalLink, Unplug } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

type Status = { connected: boolean; last_sync_at: string | null; accounts: number; positions: number };

export function BrokerSyncCard() {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<"login" | "sync" | "disconnect" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);
  const [ack3, setAck3] = useState(false);

  const refresh = async () => {
    const { data, error } = await supabase.functions.invoke("snaptrade", { body: { action: "status" } });
    if (!error) setStatus(data as Status);
  };
  useEffect(() => { refresh(); }, []);

  const openConfirm = () => {
    setAck1(false); setAck2(false); setAck3(false);
    setConfirmOpen(true);
  };

  const connect = async () => {
    setConfirmOpen(false);
    setBusy("login");
    try {
      // Log the legal acknowledgement BEFORE the OAuth handoff.
      if (user) {
        await supabase.from("audit_log").insert({
          actor_id: user.id, actor_email: user.email ?? null,
          action: "broker_connect_consent_signed",
          entity: "snaptrade", entity_id: user.id,
          payload: {
            ack_risk: ack1, ack_no_advice: ack2, ack_liability: ack3,
            tos_version: "broker-1.0", at: new Date().toISOString(),
            user_agent: navigator.userAgent,
          },
        } as any).then(() => {}, () => {}); // best-effort
      }
      const { data, error } = await supabase.functions.invoke("snaptrade", { body: { action: "login-url", redirectURI: window.location.href } });
      if (error) throw error;
      if (data?.redirectURI) {
        window.open(data.redirectURI, "_blank", "noopener,noreferrer");
        toast({ title: "Connect your broker", description: "Finish the flow in the new tab, then click Sync." });
      }
    } catch (e: any) {
      toast({ title: "SnapTrade error", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const sync = async () => {
    setBusy("sync");
    try {
      const { data, error } = await supabase.functions.invoke("snaptrade", { body: { action: "sync" } });
      if (error) throw error;
      toast({ title: "Sync complete", description: `${data?.accounts ?? 0} accounts · ${data?.positions ?? 0} positions` });
      await refresh();
    } catch (e: any) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect SnapTrade and remove cached broker positions?")) return;
    setBusy("disconnect");
    try {
      await supabase.functions.invoke("snaptrade", { body: { action: "disconnect" } });
      await refresh();
    } finally { setBusy(null); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" /> Broker sync (read-only)</CardTitle>
        <span className="text-xs text-muted-foreground">via SnapTrade</span>
      </CardHeader>
      <CardContent className="space-y-3">
        {!status ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : status.connected ? (
          <>
            <div className="text-sm">
              <span className="text-muted-foreground">Accounts: </span><span className="font-medium">{status.accounts}</span>
              <span className="mx-2 text-muted-foreground">·</span>
              <span className="text-muted-foreground">Positions: </span><span className="font-medium">{status.positions}</span>
              {status.last_sync_at && <div className="text-xs text-muted-foreground mt-1">Last sync: {new Date(status.last_sync_at).toLocaleString()}</div>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={connect} disabled={!!busy} variant="outline"><ExternalLink className="h-3 w-3 mr-1" /> Add another</Button>
              <Button size="sm" onClick={sync} disabled={!!busy}>{busy === "sync" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />} Sync now</Button>
              <Button size="sm" variant="ghost" onClick={disconnect} disabled={!!busy}><Unplug className="h-3 w-3 mr-1" /> Disconnect</Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Connect Interactive Brokers, Robinhood, Schwab, Questrade and 20+ more brokers to import your real holdings read-only. Configure SnapTrade keys in Settings → Data Providers first.</p>
            <Button size="sm" onClick={openConfirm} disabled={!!busy}>{busy === "login" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ExternalLink className="h-3 w-3 mr-1" />} Connect a broker</Button>
          </>
        )}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Broker connection — risk acknowledgement</DialogTitle>
            <DialogDescription>
              Before linking a brokerage account, you must read and confirm the following. This acknowledgement is recorded in our audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground space-y-2">
              <p><strong>No investment advice.</strong> Vela.ai is an educational research tool. Nothing on this platform — including AI outputs, scores, alerts, suggestions, optimizer results, backtests or copilot responses — constitutes investment, legal, accounting or tax advice. You are solely responsible for every decision and action taken on your brokerage account.</p>
              <p><strong>Read-only by default; you control orders.</strong> Broker connections are read-only unless you explicitly enable live trading. If you do enable live trading, every order requires an explicit confirmation from you. We do not initiate trades autonomously.</p>
              <p><strong>Market & technology risk.</strong> Securities trading carries the risk of partial or total loss. Past performance is not indicative of future results. Data may be delayed, incomplete or inaccurate. Software may fail. Network outages may prevent orders from reaching the broker.</p>
              <p><strong>Your liability.</strong> By connecting a broker you accept full and sole responsibility for the use of this platform, all orders submitted (whether by you, our software, or third-party integrations you authorise), and any resulting financial outcome. To the maximum extent permitted by law, Vela.ai, its operators and affiliates disclaim all liability for direct, indirect, incidental, consequential or punitive losses arising from your use of the platform or broker integrations.</p>
            </div>
            <div className="space-y-2.5">
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox checked={ack1} onCheckedChange={(v) => setAck1(v === true)} className="mt-0.5" />
                <span className="text-xs leading-relaxed">I understand trading involves risk of loss and accept full responsibility for any losses incurred on my account.</span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox checked={ack2} onCheckedChange={(v) => setAck2(v === true)} className="mt-0.5" />
                <span className="text-xs leading-relaxed">I understand Vela.ai provides educational tools only, not investment advice or recommendations.</span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox checked={ack3} onCheckedChange={(v) => setAck3(v === true)} className="mt-0.5" />
                <span className="text-xs leading-relaxed">I release Vela.ai and its operators from any liability for orders executed, data delays, software failures or any financial outcome on my brokerage account.</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={connect} disabled={!(ack1 && ack2 && ack3)}>
              I accept — continue to broker
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}