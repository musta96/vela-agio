import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Line, ReferenceLine, ReferenceArea, XAxis, YAxis, CartesianGrid, Tooltip, Bar } from "recharts";
import type { Bar as OhlcBar } from "@/lib/ta/types";
import { computeAVWAP, suggestAnchors, detectAVWAPReclaim } from "@/lib/ta/avwap";
import { computeVolumeProfile } from "@/lib/ta/volumeProfile";
import { TermGloss } from "@/components/TermGloss";

interface Props { bars: OhlcBar[]; }

const fmt = (t: number) => new Date(t).toLocaleDateString();

export function AVWAPProfileCard({ bars }: Props) {
  const anchors = useMemo(() => suggestAnchors(bars), [bars]);
  const [anchorIdx, setAnchorIdx] = useState<number | null>(null);
  const idx = anchorIdx ?? anchors[0]?.index ?? Math.max(0, bars.length - 60);
  const avwap = useMemo(() => computeAVWAP(bars, idx), [bars, idx]);
  const profile = useMemo(() => computeVolumeProfile(bars.slice(idx), 20), [bars, idx]);
  const reclaim = useMemo(() => detectAVWAPReclaim(avwap), [avwap]);

  const chartData = avwap.map((p) => ({ t: p.t, price: p.price, avwap: p.avwap }));
  const lastPrice = bars[bars.length - 1]?.close ?? 0;
  const lastAvwap = avwap[avwap.length - 1]?.avwap ?? null;
  const inValueArea = profile && lastPrice >= profile.val && lastPrice <= profile.vah;
  const bias =
    lastAvwap && lastPrice > lastAvwap && inValueArea ? "bullish"
    : lastAvwap && lastPrice < lastAvwap && inValueArea ? "bearish" : "neutral";

  return (
    <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Anchored VWAP + Volume Profile</h3>
        </div>
        <Badge variant="outline" className="uppercase">{bias}</Badge>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {anchors.map((a, i) => (
          <Button key={i} type="button" variant={a.index === idx ? "default" : "outline"} size="sm" onClick={() => setAnchorIdx(a.index)}>
            {a.label} · {fmt(a.t)}
          </Button>
        ))}
      </div>

      <div className="w-full h-[280px]">
        <ResponsiveContainer>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="t" tickFormatter={(t) => fmt(t as number)} fontSize={11} stroke="hsl(var(--muted-foreground))" />
            <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" domain={["auto", "auto"]} />
            <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} labelFormatter={(t) => fmt(t as number)} formatter={(v: number | string) => typeof v === "number" ? v.toFixed(2) : v} />
            <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" dot={false} name="Close" strokeWidth={2} />
            <Line type="monotone" dataKey="avwap" stroke="hsl(var(--warning, var(--destructive)))" dot={false} name="AVWAP" strokeDasharray="4 2" />
            {profile && (
              <>
                <ReferenceArea y1={profile.val} y2={profile.vah} fill="hsl(var(--primary))" fillOpacity={0.08} strokeOpacity={0.3} />
                <ReferenceLine y={profile.poc} stroke="hsl(var(--primary))" strokeDasharray="6 2" label={{ value: `POC ${profile.poc.toFixed(2)}`, fill: "hsl(var(--primary))", fontSize: 10, position: "right" }} />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
        <div className="p-2 rounded border border-border">
          <p className="text-muted-foreground"><TermGloss term="avwap">AVWAP</TermGloss></p>
          <p className="font-semibold">{lastAvwap ? lastAvwap.toFixed(2) : "—"}</p>
        </div>
        <div className="p-2 rounded border border-border">
          <p className="text-muted-foreground"><TermGloss term="poc">POC</TermGloss></p>
          <p className="font-semibold">{profile ? profile.poc.toFixed(2) : "—"}</p>
        </div>
        <div className="p-2 rounded border border-border">
          <p className="text-muted-foreground">Value Area</p>
          <p className="font-semibold">{profile ? `${profile.val.toFixed(2)} – ${profile.vah.toFixed(2)}` : "—"}</p>
        </div>
        <div className="p-2 rounded border border-border">
          <p className="text-muted-foreground">Reclaim</p>
          <p className="font-semibold">{reclaim.bullish ? "Bullish ↑" : reclaim.bearish ? "Bearish ↓" : "—"}</p>
        </div>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Confluence signal fires when price closes on the AVWAP side of the trend and stays inside the volume-profile Value Area.
      </p>
    </Card>
  );
}