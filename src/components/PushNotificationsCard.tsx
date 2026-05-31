import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Bell, BellOff, Info } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Link } from "react-router-dom";

export function PushNotificationsCard() {
  const { support, permission, subscribed, busy, subscribe, unsubscribe } = usePushNotifications();

  return (
    <Card className="p-5 rounded-2xl">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
          {subscribed ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Push notifications</h3>
              <p className="text-sm text-muted-foreground">
                Get price alerts, AI signals and digest updates even when Vela.ai is closed.
              </p>
            </div>
            {support === "supported" && (
              <Switch
                checked={subscribed}
                disabled={busy}
                onCheckedChange={(v) => (v ? subscribe() : unsubscribe())}
              />
            )}
          </div>

          {support === "ios-needs-install" && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                iPhone needs Vela.ai added to your Home Screen first.{" "}
                <Link to="/install" className="text-accent underline">Install instructions →</Link>
              </span>
            </div>
          )}

          {support === "unsupported" && (
            <p className="mt-3 text-xs text-muted-foreground">
              This browser doesn't support push notifications. Try Chrome, Edge, Firefox, or Safari 16.4+.
            </p>
          )}

          {support === "supported" && permission === "denied" && (
            <p className="mt-3 text-xs text-destructive">
              Notifications are blocked in your browser settings. Allow them for this site and try again.
            </p>
          )}

          {support === "supported" && !subscribed && permission !== "denied" && (
            <Button size="sm" className="mt-3" disabled={busy} onClick={subscribe}>
              {busy ? "Enabling…" : "Enable notifications"}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}