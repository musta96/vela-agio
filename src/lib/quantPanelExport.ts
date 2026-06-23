import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { downloadCsv, type CsvRow } from "@/lib/csvUtil";
import { quantile } from "@/lib/quantScenarios";
import type { ScenarioImpact } from "@/lib/quantScenarios";

export interface QuantExportInput {
  basket: { symbol: string; weight: number; name?: string }[];
  strategy?: string;
  range?: string;
  horizonLabel: string;
  horizonDays: number;
  paths: number;
  confidences: number[];
  currency: string;
  startValue: number;
  finals: number[];
  histStats: {
    var95: number; cvar95: number; var99: number; cvar99: number;
    annVol: number; annRet: number; observations: number;
  } | null;
  varRows: { confidence: number; varPct: number; cvarPct: number }[];
  scenarios: ScenarioImpact[];
}

function slug(input: QuantExportInput): string {
  const sym = input.basket.map((b) => b.symbol).join("-");
  return `${sym || "basket"}_quant_${input.horizonLabel}_${new Date().toISOString().slice(0, 10)}`
    .replace(/[^a-zA-Z0-9_\-]/g, "_");
}

function fmtMoney(v: number, cur: string): string {
  const sign = v < 0 ? "-" : "";
  return `${sign}${cur}${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function fmtPct(v: number, d = 2): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
}

export function exportQuantCsv(input: QuantExportInput): void {
  const rows: CsvRow[] = [];
  rows.push(["Quantitative Analysis Report"]);
  rows.push(["Generated", new Date().toISOString()]);
  if (input.strategy) rows.push(["Strategy", input.strategy]);
  if (input.range) rows.push(["Range", input.range]);
  rows.push(["Horizon", `${input.horizonLabel} (${input.horizonDays} trading days)`]);
  rows.push(["Paths", input.paths]);
  rows.push(["Confidence levels", input.confidences.map((c) => `${(c * 100).toFixed(0)}%`).join("|")]);
  rows.push(["Start value", input.startValue]);
  rows.push([]);

  rows.push(["Holdings"]);
  rows.push(["Symbol", "Name", "Weight"]);
  input.basket.forEach((h) => rows.push([h.symbol, h.name ?? "", h.weight.toFixed(4)]));
  rows.push([]);

  if (input.finals.length) {
    rows.push(["Monte Carlo Percentiles"]);
    rows.push(["Percentile", "Terminal value"]);
    [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95].forEach((q) => {
      rows.push([`P${(q * 100).toFixed(0)}`, quantile(input.finals, q).toFixed(2)]);
    });
    rows.push([]);
  }

  if (input.histStats) {
    rows.push(["Historical Risk Metrics"]);
    rows.push(["Metric", "Value"]);
    rows.push(["Ann. return", fmtPct(input.histStats.annRet, 2)]);
    rows.push(["Ann. volatility", fmtPct(input.histStats.annVol, 2)]);
    rows.push(["Observations", input.histStats.observations]);
    rows.push([]);
    rows.push(["VaR / CVaR (1-day, historical)"]);
    rows.push(["Confidence", "VaR %", `VaR (${input.currency})`, "CVaR %", `CVaR (${input.currency})`]);
    input.varRows.forEach((r) => {
      rows.push([
        `${(r.confidence * 100).toFixed(0)}%`,
        (r.varPct * 100).toFixed(3),
        (r.varPct * input.startValue).toFixed(2),
        (r.cvarPct * 100).toFixed(3),
        (r.cvarPct * input.startValue).toFixed(2),
      ]);
    });
    rows.push([]);
  }

  if (input.scenarios.length) {
    rows.push(["Macro Scenarios"]);
    rows.push(["Scenario", "P/L %", `P/L (${input.currency})`, "Worst bucket", "Worst bucket P/L %"]);
    input.scenarios.slice().sort((a, b) => a.pnlPct - b.pnlPct).forEach((s) => {
      const worst = [...s.byBucket].sort((a, b) => a.pnl - b.pnl)[0];
      rows.push([
        s.scenario.name,
        (s.pnlPct * 100).toFixed(2),
        s.pnl.toFixed(2),
        worst?.bucket ?? "",
        worst ? (worst.pnlPct * 100).toFixed(2) : "",
      ]);
    });
    rows.push([]);
    rows.push(["Scenario · per-position contribution"]);
    rows.push(["Scenario", "Symbol", "Weight", "Shock %", `P/L (${input.currency})`]);
    input.scenarios.forEach((s) => {
      s.byPosition.forEach((p) => {
        rows.push([s.scenario.name, p.symbol, p.weight.toFixed(4), (p.shockPct * 100).toFixed(2), p.pnl.toFixed(2)]);
      });
    });
  }

  downloadCsv(`${slug(input)}.csv`, rows);
}

export function exportQuantPdf(
  input: QuantExportInput,
  charts?: { histogram?: string; fan?: string },
): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Backtest Quantitative Analysis", margin, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 68);
  doc.setTextColor(0);

  let y = 96;
  const meta: [string, string][] = [
    ["Horizon", `${input.horizonLabel} (${input.horizonDays} trading days)`],
    ["Paths", String(input.paths)],
    ["Confidence", input.confidences.map((c) => `${(c * 100).toFixed(0)}%`).join(", ")],
    ["Holdings", input.basket.map((b) => `${b.symbol} (${(b.weight * 100).toFixed(1)}%)`).join(", ")],
  ];
  doc.setFontSize(10);
  meta.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(v, margin + 80, y, { maxWidth: pageWidth - margin * 2 - 80 });
    y += 14;
  });

  // Monte Carlo percentiles
  if (input.finals.length) {
    autoTable(doc, {
      startY: y + 10,
      head: [["Monte Carlo percentile", "Terminal value"]],
      body: [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95].map((q) => [
        `P${(q * 100).toFixed(0)}`,
        fmtMoney(quantile(input.finals, q), input.currency),
      ]),
      theme: "striped",
      headStyles: { fillColor: [15, 27, 61] },
      styles: { fontSize: 10 },
      margin: { left: margin, right: margin },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  }

  // Chart images
  if (charts?.histogram) {
    if (y > 600) { doc.addPage(); y = 50; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Monte Carlo distribution", margin, y);
    doc.addImage(charts.histogram, "PNG", margin, y + 8, pageWidth - margin * 2, 180);
    y += 200;
  }
  if (charts?.fan) {
    if (y > 600) { doc.addPage(); y = 50; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Fan chart · percentile cones", margin, y);
    doc.addImage(charts.fan, "PNG", margin, y + 8, pageWidth - margin * 2, 180);
    y += 200;
  }

  // VaR table
  if (input.histStats && input.varRows.length) {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("VaR / CVaR (historical, 1-day)", margin, 50);
    autoTable(doc, {
      startY: 64,
      head: [["Confidence", "VaR %", `VaR (${input.currency})`, "CVaR %", `CVaR (${input.currency})`]],
      body: input.varRows.map((r) => [
        `${(r.confidence * 100).toFixed(0)}%`,
        `${(r.varPct * 100).toFixed(2)}%`,
        fmtMoney(r.varPct * input.startValue, input.currency),
        `${(r.cvarPct * 100).toFixed(2)}%`,
        fmtMoney(r.cvarPct * input.startValue, input.currency),
      ]),
      theme: "striped",
      headStyles: { fillColor: [15, 27, 61] },
      styles: { fontSize: 10 },
      margin: { left: margin, right: margin },
    });
  }

  // Scenarios
  if (input.scenarios.length) {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Macro scenario stress", margin, 50);
    autoTable(doc, {
      startY: 64,
      head: [["Scenario", "P/L %", `P/L (${input.currency})`, "Worst bucket"]],
      body: input.scenarios.slice().sort((a, b) => a.pnlPct - b.pnlPct).map((s) => {
        const worst = [...s.byBucket].sort((a, b) => a.pnl - b.pnl)[0];
        return [
          s.scenario.name,
          `${(s.pnlPct * 100).toFixed(2)}%`,
          fmtMoney(s.pnl, input.currency),
          worst ? `${worst.bucket} (${(worst.pnlPct * 100).toFixed(1)}%)` : "—",
        ];
      }),
      theme: "striped",
      headStyles: { fillColor: [15, 27, 61] },
      styles: { fontSize: 10 },
      margin: { left: margin, right: margin },
    });
  }

  doc.save(`${slug(input)}.pdf`);
}