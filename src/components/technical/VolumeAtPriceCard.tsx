import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Layers } from "lucide-react";
import { BarChart, Bar, YAxis, XAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";
import { computeVolumeProfile } from "@/lib/ta/volumeProfile";
import type { Bar as OhlcBar } from "@/lib/ta/types";

interface Props { bars: OhlcBar[]; }

export function VolumeAtPriceCard({ bars }: Props) {
  const profile = useMemo(() => computeVolumeProfile(bars.slice(-120), 24), [bars]);
  if (!profile) return null;
  const data = profile.bins.map((b) => ({ price: b.price.toFixed(2), volume: b.volume, raw: b.price }));
  const lastPrice = bars[bars.length - 1]?.close;

  return (
    <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
      <div className="flex items-center gap-2 mb-3">
        <Layers className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Volume at price (last 120 bars)</h3>
      </div>
      <div className="w-full h-[320px]">
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical">
            <XAxis type="number" fontSize={10} stroke="hsl(var(--muted-foreground))" hide />
            <YAxis type="category" dataKey="price" fontSize={10} stroke="hsl(var(--muted-foreground))" />
            <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} formatter={(v: number | string) => typeof v === "number" ? v.toFixed(0) : v} />
            <Bar dataKey="volume">
              {data.map((d, i) => (
                <Cell key={i} fill={d.raw === profile.poc || (d.raw >= profile.val && d.raw <= profile.vah) ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"} fillOpacity={d.raw === profile.poc ? 1 : d.raw >= profile.val && d.raw <= profile.vah ? 0.55 : 0.28} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
        <div className="p-2 rounded border border-primary/30 bg-primary/5">POC · <span className="font-semibold">{profile.poc.toFixed(2)}</span></div>
        <div className="p-2 rounded border border-border">VAL · <span className="font-semibold">{profile.val.toFixed(2)}</span></div>
        <div className="p-2 rounded border border-border">VAH · <span className="font-semibold">{profile.vah.toFixed(2)}</span></div>
      </div>
      {typeof lastPrice === "number" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Last price {lastPrice.toFixed(2)} — {lastPrice >= profile.val && lastPrice <= profile.vah ? "inside value area (balanced)" : lastPrice > profile.vah ? "above value area (bullish imbalance)" : "below value area (bearish imbalance)"}.
        </p>
      )}
    </Card>
  );
}