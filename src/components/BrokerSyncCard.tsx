import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, RefreshCw, Loader2, ExternalLink, Unplug } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Status = { connected: boolean; last_sync_at: string | null; accounts: number; positions: number };

export function BrokerSyncCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<"login" | "sync" | "disconnect" | null>(null);

  const refresh = async () => {
    const { data, error } = await supabase.functions.invoke("snaptrade", { body: { action: "status" } });
    if (!error) setStatus(data as Status);
  };
  useEffect(() => { refresh(); }, []);

  const connect = async () => {
    setBusy("login");
    try {
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
            <Button size="sm" onClick={connect} disabled={!!busy}>{busy === "login" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ExternalLink className="h-3 w-3 mr-1" />} Connect a broker</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}