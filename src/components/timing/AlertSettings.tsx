import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Bell, BellOff, BellRing } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_ALERT_PREFS,
  readPrefs,
  writePrefs,
  requestBrowserPermission,
  type AlertPrefs,
} from "@/lib/timing/alerts";

interface Props {
  symbol: string;
  lookaheadDays: number;
  onChange?: (prefs: AlertPrefs) => void;
}

export function AlertSettings({ symbol, lookaheadDays, onChange }: Props) {
  const [prefs, setPrefs] = useState<AlertPrefs>(DEFAULT_ALERT_PREFS);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => { setPrefs(readPrefs(symbol)); }, [symbol]);
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  function update(patch: Partial<AlertPrefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    writePrefs(symbol, next);
    onChange?.(next);
  }

  async function toggleEnabled(v: boolean) {
    if (v && prefs.browserNotify) {
      const p = await requestBrowserPermission();
      setPermission(p);
      if (p !== "granted") {
        toast.warning("Browser notifications blocked — in-app toasts will still fire.");
      }
    }
    update({ enabled: v });
    toast[v ? "success" : "message"](v ? `Alerts on for ${symbol}` : `Alerts off for ${symbol}`);
  }

  const Icon = prefs.enabled ? BellRing : Bell;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant={prefs.enabled ? "secondary" : "outline"}
          className="h-7 gap-1.5 text-[11px]"
          aria-label="Configure entry-timing alerts"
        >
          <Icon className="h-3.5 w-3.5" />
          Alerts{prefs.enabled ? " on" : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div>
          <p className="text-sm font-semibold">Verdict-flip alerts</p>
          <p className="text-[11px] text-muted-foreground">
            Notify when {symbol}'s entry verdict flips and a catalyst falls in the window.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="alerts-enabled" className="text-xs">Enabled</Label>
          <Switch id="alerts-enabled" checked={prefs.enabled} onCheckedChange={toggleEnabled} />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="alerts-buy" className="text-xs">On flip to <span className="text-success font-semibold">BUY</span></Label>
          <Switch id="alerts-buy" checked={prefs.onBuy} onCheckedChange={(v) => update({ onBuy: v })} disabled={!prefs.enabled} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="alerts-avoid" className="text-xs">On flip to <span className="text-destructive font-semibold">AVOID</span></Label>
          <Switch id="alerts-avoid" checked={prefs.onAvoid} onCheckedChange={(v) => update({ onAvoid: v })} disabled={!prefs.enabled} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Only if a catalyst is within</Label>
          <ToggleGroup
            type="single"
            size="sm"
            value={String(prefs.windowDays)}
            onValueChange={(v) => v && update({ windowDays: Number(v) })}
            disabled={!prefs.enabled}
          >
            {[7, 30, 90].map((n) => (
              <ToggleGroupItem key={n} value={String(n)} className="h-7 px-2 text-[11px]">{n}d</ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-[10px] text-muted-foreground">
            Current lookahead: {lookaheadDays}d. Choose the alert window independently.
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-2">
          <Label htmlFor="alerts-browser" className="text-xs flex items-center gap-1.5">
            <BellRing className="h-3 w-3" /> Browser notification
          </Label>
          <Switch
            id="alerts-browser"
            checked={prefs.browserNotify}
            onCheckedChange={async (v) => {
              update({ browserNotify: v });
              if (v) {
                const p = await requestBrowserPermission();
                setPermission(p);
              }
            }}
            disabled={!prefs.enabled}
          />
        </div>
        {prefs.enabled && prefs.browserNotify && permission !== "granted" && (
          <p className="text-[10px] text-warning flex items-center gap-1">
            <BellOff className="h-3 w-3" /> Browser permission: {permission}. In-app toasts will still fire.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default AlertSettings;