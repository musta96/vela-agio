import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, FileJson, Download } from "lucide-react";
import { exportTechnicalJson, exportTechnicalPdf, type TechnicalThesisExport } from "@/lib/technicalExport";
import type { FullAnalysis } from "@/lib/ta";
import type { TradePlan } from "@/lib/ta/planner";

interface Props {
  symbol: string;
  name?: string;
  timeframe: string;
  lastPrice: number;
  atr: number | null;
  analysis: FullAnalysis;
  plan?: TradePlan | null;
  aiThesis?: string | null;
}

export function TechnicalExportCard(props: Props) {
  const [pending, setPending] = useState<"pdf" | "json" | null>(null);

  const build = (): TechnicalThesisExport => ({
    symbol: props.symbol,
    name: props.name,
    timeframe: props.timeframe,
    generatedAt: new Date().toISOString(),
    lastPrice: props.lastPrice,
    atr: props.atr,
    analysis: props.analysis,
    plan: props.plan ?? null,
    aiThesis: props.aiThesis ?? null,
  });

  const doPdf = () => {
    setPending("pdf");
    try { exportTechnicalPdf(build()); } finally { setPending(null); }
  };
  const doJson = () => {
    setPending("json");
    try { exportTechnicalJson(build()); } finally { setPending(null); }
  };

  return (
    <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
      <div className="flex items-center gap-2 mb-3">
        <Download className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Export thesis</h3>
        <Badge variant="outline" className="text-[10px]">PDF · JSON</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Download the full technical thesis — detected levels, patterns, structure, trade plan and R:R — for audit or sharing.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={doPdf} disabled={pending !== null} className="gap-2">
          <FileText className="h-4 w-4" /> {pending === "pdf" ? "Generating…" : "Download PDF"}
        </Button>
        <Button size="sm" variant="outline" onClick={doJson} disabled={pending !== null} className="gap-2">
          <FileJson className="h-4 w-4" /> {pending === "json" ? "Generating…" : "Download JSON"}
        </Button>
      </div>
    </Card>
  );
}