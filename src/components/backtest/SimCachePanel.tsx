import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Database, Trash2 } from "lucide-react";
import {
  cacheStats, clearSimCache, getSimCacheSettings, listCacheEntries,
  setMaxEntries, setMaxAgeDays, setMaxWorkers,
} from "@/lib/backtest/simCache";

export function SimCachePanel() {
  const [tick, setTick] = useState(0);
  const stats = cacheStats();
  const settings = getSimCacheSettings();
  const [autoWorkers, setAutoWorkers] = useState(settings.maxWorkers === "auto");
  const [disableWorkers, setDisableWorkers] = useState(settings.maxWorkers === 0);
  const [cap, setCap] = useState<number>(typeof settings.maxWorkers === "number" && settings.maxWorkers > 0 ? settings.maxWorkers : 4);

  const hc = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency || 4) : 4;

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 3000);
    return () => clearInterval(id);
  }, []);

  const commitWorkers = (auto: boolean, disabled: boolean, n: number) => {
    if (disabled) setMaxWorkers(0);
    else if (auto) setMaxWorkers("auto");
    else setMaxWorkers(n);
    setTick((t) => t + 1);
  };

  const entries = listCacheEntries(10);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2"><Database className="h-4 w-4 text-primary" /><CardTitle className="text-base">Simulation cache & performance</CardTitle></div>
        <CardDescription className="text-xs">
          Persisted across reloads. Cache invalidates automatically when the bar series changes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <Kpi label="Entries" value={String(stats.size)} />
          <Kpi label="Cap" value={String(stats.maxEntries)} />
          <Kpi label="Max age" value={`${stats.maxAgeDays}d`} />
          <Kpi label="Workers" value={stats.maxWorkers === "auto" ? "auto" : stats.maxWorkers === 0 ? "off" : String(stats.maxWorkers)} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-[11px]">LRU cap: {settings.maxEntries}</Label>
            <Slider value={[settings.maxEntries]} min={50} max={1000} step={25}
              onValueChange={(v) => { setMaxEntries(v[0]); setTick((t) => t + 1); }} className="mt-2" />
          </div>
          <div>
            <Label className="text-[11px]">Max age: {settings.maxAgeDays} days</Label>
            <Slider value={[settings.maxAgeDays]} min={1} max={90} step={1}
              onValueChange={(v) => { setMaxAgeDays(v[0]); setTick((t) => t + 1); }} className="mt-2" />
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-3 items-end">
          <div className="flex items-center gap-2">
            <Switch checked={autoWorkers} onCheckedChange={(v) => { setAutoWorkers(v); if (v) setDisableWorkers(false); commitWorkers(v, false, cap); }} />
            <Label className="text-[11px]">Auto (device-adaptive)</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={disableWorkers} onCheckedChange={(v) => { setDisableWorkers(v); if (v) setAutoWorkers(false); commitWorkers(false, v, cap); }} />
            <Label className="text-[11px]">Disable workers (fallback)</Label>
          </div>
          <div>
            <Label className="text-[11px]">Manual cap: {cap} / {hc} cores</Label>
            <Slider value={[cap]} min={1} max={Math.max(1, hc)} step={1}
              onValueChange={(v) => setCap(v[0])}
              onValueCommit={(v) => { setCap(v[0]); if (!autoWorkers && !disableWorkers) commitWorkers(false, false, v[0]); }}
              disabled={autoWorkers || disableWorkers}
              className="mt-2" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => { clearSimCache(); setTick((t) => t + 1); }} className="gap-1">
            <Trash2 className="h-3.5 w-3.5" /> Clear cache
          </Button>
          <span className="text-[10px] text-muted-foreground">
            {stats.newest ? `Latest ${new Date(stats.newest).toLocaleString()}` : "Empty"}
            {stats.oldest && stats.newest && stats.oldest !== stats.newest ? ` · oldest ${new Date(stats.oldest).toLocaleString()}` : ""}
          </span>
        </div>

        {entries.length > 0 && (
          <div className="max-h-40 overflow-auto border border-border rounded">
            <table className="text-[11px] w-full">
              <thead className="bg-muted/40 sticky top-0"><tr>
                <th className="text-left p-1.5">Cached</th>
                <th className="text-right p-1.5">Return</th>
                <th className="text-right p-1.5">Sharpe</th>
                <th className="text-right p-1.5">Trades</th>
              </tr></thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.key} className="border-t border-border">
                    <td className="p-1.5 text-muted-foreground">{e.cachedAt ? new Date(e.cachedAt).toLocaleTimeString() : "—"}</td>
                    <td className={`p-1.5 text-right ${e.totalReturn >= 0 ? "text-success" : "text-destructive"}`}>{e.totalReturn.toFixed(2)}%</td>
                    <td className="p-1.5 text-right">{e.sharpe.toFixed(2)}</td>
                    <td className="p-1.5 text-right text-muted-foreground">{e.trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Badge variant="outline" className="text-[10px]">refresh #{tick}</Badge>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 rounded border border-border">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}