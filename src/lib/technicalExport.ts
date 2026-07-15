import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { FullAnalysis } from "@/lib/ta";
import type { TradePlan } from "@/lib/ta/planner";

export interface TechnicalThesisExport {
  symbol: string;
  name?: string;
  timeframe: string;
  generatedAt: string;
  lastPrice: number;
  atr?: number | null;
  analysis: FullAnalysis;
  plan?: TradePlan | null;
  aiThesis?: string | null;
}

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const slug = (t: TechnicalThesisExport) =>
  `${t.symbol}_${t.timeframe}_${new Date().toISOString().slice(0, 10)}`.replace(/[^a-zA-Z0-9_\-]/g, "_");

export function exportTechnicalJson(t: TechnicalThesisExport) {
  const blob = new Blob([JSON.stringify(t, null, 2)], { type: "application/json" });
  triggerDownload(blob, `technical_thesis_${slug(t)}.json`);
}

export function exportTechnicalPdf(t: TechnicalThesisExport) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Technical Thesis", margin, 50);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`Generated: ${new Date(t.generatedAt).toLocaleString()}`, margin, 68);
  doc.setTextColor(0);

  doc.setFontSize(11);
  let y = 96;
  const meta: [string, string][] = [
    ["Symbol", `${t.symbol}${t.name ? ` — ${t.name}` : ""}`],
    ["Timeframe", t.timeframe],
    ["Last price", t.lastPrice.toFixed(4)],
    ["ATR (14)", t.atr != null ? t.atr.toFixed(4) : "—"],
  ];
  meta.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(v, margin + 80, y);
    y += 16;
  });

  // Insights
  if (t.analysis.insights.length) {
    autoTable(doc, {
      startY: y + 8,
      head: [["Insight", "Bias", "Confidence", "Detail"]],
      body: t.analysis.insights.map((i) => [i.name, i.bias, i.confidence, i.detail]),
      theme: "striped", styles: { fontSize: 9 },
      headStyles: { fillColor: [15, 27, 61] },
      margin: { left: margin, right: margin },
    });
  }

  // Detected levels
  const sr = t.analysis.supportResistance;
  if (sr.length) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable?.finalY + 16 || y + 8,
      head: [["Type", "Price", "Touches", "Strength"]],
      body: sr.map((z) => [z.type, z.price.toFixed(4), String(z.touches), z.strength.toFixed(2)]),
      theme: "grid", styles: { fontSize: 9 },
      headStyles: { fillColor: [15, 27, 61] },
      margin: { left: margin, right: margin },
    });
  }

  // Patterns
  const patterns = [
    ...t.analysis.candlestickPatterns.slice(-8).map((c) => ["Candle", c.name, c.bias, c.description]),
    ...t.analysis.chartPatterns.map((p) => ["Chart", p.name, p.bias, `key ${p.keyPrice.toFixed(2)}`]),
    ...t.analysis.structure.slice(-4).map((s) => ["Structure", s.kind, s.bias, `level ${s.level.toFixed(2)}`]),
  ];
  if (patterns.length) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable?.finalY + 16,
      head: [["Kind", "Name", "Bias", "Detail"]],
      body: patterns,
      theme: "striped", styles: { fontSize: 9 },
      headStyles: { fillColor: [15, 27, 61] },
      margin: { left: margin, right: margin },
    });
  }

  // Trade plan
  if (t.plan) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable?.finalY + 16,
      head: [["Trade Plan", "Value"]],
      body: [
        ["Side", t.plan.side],
        ["Entry", t.plan.entry.toFixed(4)],
        ["Stop", t.plan.stop.toFixed(4)],
        ["Target", t.plan.target.toFixed(4)],
        ["R:R", t.plan.rr.toFixed(2)],
        ["Risk/share", t.plan.riskPerShare.toFixed(4)],
        ["Position size", String(t.plan.positionSize)],
        ["Position value", t.plan.positionValue.toFixed(2)],
        ["Risk amount", t.plan.riskAmount.toFixed(2)],
        ["ATR multiple", t.plan.atrMultiple ? t.plan.atrMultiple.toFixed(2) : "—"],
      ],
      theme: "grid", styles: { fontSize: 9 },
      headStyles: { fillColor: [15, 27, 61] },
      margin: { left: margin, right: margin },
    });
    if (t.plan.warnings.length) {
      const wy = (doc as any).lastAutoTable.finalY + 12;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Warnings:", margin, wy);
      doc.setFont("helvetica", "normal");
      t.plan.warnings.forEach((w, i) => doc.text(`• ${w}`, margin + 10, wy + 14 + i * 12, { maxWidth: pageWidth - margin * 2 - 10 }));
    }
  }

  // AI thesis (optional)
  if (t.aiThesis) {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("AI Trade Thesis", margin, 50);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const split = doc.splitTextToSize(t.aiThesis, pageWidth - margin * 2);
    doc.text(split, margin, 70);
  }

  doc.save(`technical_thesis_${slug(t)}.pdf`);
}