import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { TimingSignal, TimingResult } from "@/lib/timing/schema";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  symbol: string;
  result: TimingResult;
}

const FAMILY_LABEL: Record<TimingSignal["family"], string> = {
  tech: "Technical",
  fund: "Fundamental",
  macro: "Macro / event",
};

function synthFormula(s: TimingSignal): string {
  if (s.formula) return s.formula;
  const sign = s.direction === "buy" ? "+" : s.direction === "avoid" ? "−" : "±";
  const val = s.value != null ? String(s.value) : "—";
  const rule = s.rule ?? s.note ?? `${s.label} triggered`;
  return `${rule} · value = ${val} ⇒ ${sign}${s.weight}`;
}

export function DriversDialog({ open, onOpenChange, symbol, result }: Props) {
  const rows = useMemo(() => {
    return result.signals
      .map((s) => ({
        ...s,
        contribution: s.direction === "buy" ? s.weight : s.direction === "avoid" ? -s.weight : 0,
      }))
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  }, [result.signals]);

  const posSum = rows.filter((r) => r.contribution > 0).reduce((a, b) => a + b.contribution, 0);
  const negSum = rows.filter((r) => r.contribution < 0).reduce((a, b) => a + b.contribution, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{symbol} — full driver breakdown</DialogTitle>
          <DialogDescription>
            Composite = Σ signed contributions per signal. Buy signals add, avoid signals subtract, wait contributes 0.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Badge variant="outline" className="border-success/40 text-success font-mono">Σ buy +{posSum}</Badge>
          <Badge variant="outline" className="border-destructive/40 text-destructive font-mono">Σ avoid {negSum}</Badge>
          <Badge variant="outline" className="font-mono">Net {result.score >= 0 ? "+" : ""}{result.score}</Badge>
          <span className="text-muted-foreground">Verdict: <b className="uppercase">{result.verdict}</b></span>
        </div>

        <div className="mt-2 max-h-[60vh] overflow-y-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">#</th>
                <th className="text-left px-3 py-2 font-medium">Family</th>
                <th className="text-left px-3 py-2 font-medium">Signal</th>
                <th className="text-left px-3 py-2 font-medium">Formula</th>
                <th className="text-right px-3 py-2 font-medium">Contribution</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => {
                const positive = s.contribution > 0;
                const neutral = s.contribution === 0;
                const cls = neutral
                  ? "text-muted-foreground"
                  : positive
                    ? "text-success"
                    : "text-destructive";
                return (
                  <tr key={s.key} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-mono text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2">{FAMILY_LABEL[s.family]}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{s.label}</div>
                      {s.note && <div className="text-[10px] text-muted-foreground mt-0.5">{s.note}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{synthFormula(s)}</td>
                    <td className={`px-3 py-2 text-right font-mono font-semibold ${cls}`}>
                      {neutral ? "0" : `${positive ? "+" : "−"}${Math.abs(s.contribution)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DriversDialog;