import { Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DetectorSettings } from "@/lib/ta/detectorSettings";

interface Props {
  settings: DetectorSettings;
  onChange: (settings: DetectorSettings) => void;
}

export function DetectorSettingsCard({ settings, onChange }: Props) {
  const set = (key: keyof DetectorSettings, value: string) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    onChange({ ...settings, [key]: Math.max(1, n) });
  };
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Settings2 className="h-4 w-4 text-primary" /> Detector settings</CardTitle>
        <p className="text-xs text-muted-foreground">These parameters control the overlays and signal statistics for the current run.</p>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Pattern window" value={settings.patternLookback} onChange={(v) => set("patternLookback", v)} />
        <Field label="S/R tolerance %" value={settings.supportResistanceTolerance} step="0.1" onChange={(v) => set("supportResistanceTolerance", v)} />
        <Field label="Fibonacci window" value={settings.fibonacciLookback} onChange={(v) => set("fibonacciLookback", v)} />
        <Field label="Volume profile window" value={settings.volumeProfileLookback} onChange={(v) => set("volumeProfileLookback", v)} />
        <Field label="Profile bins" value={settings.volumeProfileBins} onChange={(v) => set("volumeProfileBins", v)} />
        <Field label="AVWAP anchor bars" value={settings.avwapAnchorLookback} onChange={(v) => set("avwapAnchorLookback", v)} />
        <Field label="Trendline window" value={settings.trendlineLookback} onChange={(v) => set("trendlineLookback", v)} />
        <Field label="Confirmations" value={settings.confirmationBars} onChange={(v) => set("confirmationBars", v)} />
      </CardContent>
    </Card>
  );
}

function Field({ label, value, step, onChange }: { label: string; value: number; step?: string; onChange: (value: string) => void }) {
  return <div className="space-y-1.5"><Label className="text-[11px] text-muted-foreground">{label}</Label><Input type="number" min={1} step={step} value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs" /></div>;
}
