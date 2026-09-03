import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Bar } from "@/lib/ta/types";
import type { DetectorSettings } from "@/lib/ta/detectorSettings";
import { signalReport } from "@/lib/backtest/signalReport";

export function SignalPerformanceCard({ bars, settings }: { bars: Bar[]; settings: DetectorSettings }) {
  const report = signalReport(bars, settings);
  if (!report.length) return null;
  return <Card>
    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-primary" /> Signal performance report</CardTitle><p className="text-xs text-muted-foreground">Forward 10-bar outcomes grouped by the signal that appeared in this backtest window.</p></CardHeader>
    <CardContent className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="pb-2 font-medium">Signal</th><th className="pb-2 font-medium">Signals</th><th className="pb-2 font-medium">Win rate</th><th className="pb-2 font-medium">Avg. return</th><th className="pb-2 font-medium">Best</th><th className="pb-2 font-medium">Worst</th></tr></thead><tbody>{report.map((row) => <tr key={row.kind} className="border-b border-border/50"><td className="py-2 font-medium">{row.kind}</td><td className="py-2">{row.signals}</td><td className="py-2"><Badge variant={row.winRate >= 50 ? "default" : "secondary"}>{row.winRate.toFixed(0)}%</Badge></td><td className={row.averageReturn >= 0 ? "py-2 text-success" : "py-2 text-destructive"}>{row.averageReturn >= 0 ? "+" : ""}{row.averageReturn.toFixed(2)}%</td><td className="py-2 text-success">+{row.bestReturn.toFixed(2)}%</td><td className="py-2 text-destructive">{row.worstReturn.toFixed(2)}%</td></tr>)}</tbody></table></CardContent>
  </Card>;
}
