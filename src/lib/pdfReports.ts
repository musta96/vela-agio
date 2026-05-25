import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const BRAND = {
  primary: [13, 71, 161] as [number, number, number], // deep navy
  accent: [20, 184, 166] as [number, number, number], // teal
  muted: [100, 116, 139] as [number, number, number],
};

function header(doc: jsPDF, title: string, subtitle?: string) {
  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("FTSE MIB Analytics", 14, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(new Date().toLocaleString(), doc.internal.pageSize.getWidth() - 14, 14, { align: "right" });
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title, 14, 34);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND.muted);
    doc.text(subtitle, 14, 41);
    doc.setTextColor(0, 0, 0);
  }
}

function footer(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(
      `FTSE MIB Analytics · Not financial advice · Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" },
    );
  }
}

function disclaimer(doc: jsPDF, y: number) {
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.muted);
  const txt =
    "Disclaimer: This report is generated automatically by FTSE MIB Analytics for informational and educational purposes only. It does not constitute investment advice, a recommendation, or an offer to buy or sell any security. Data may be delayed, incomplete, or inaccurate. Always do your own research and consult a licensed financial advisor before making investment decisions.";
  const lines = doc.splitTextToSize(txt, doc.internal.pageSize.getWidth() - 28);
  doc.text(lines, 14, y);
  doc.setTextColor(0, 0, 0);
  return y + lines.length * 3.5 + 4;
}

export interface PortfolioReportInput {
  holdings: Array<{
    symbol: string;
    name: string;
    shares: number;
    avgPrice: number;
    currentPrice: number;
    currency?: string;
  }>;
}

export function generatePortfolioReport({ holdings }: PortfolioReportInput) {
  const doc = new jsPDF();
  header(doc, "Portfolio Report", `${holdings.length} holdings`);

  let totalValue = 0;
  let totalCost = 0;
  const rows = holdings.map((h) => {
    const value = h.shares * h.currentPrice;
    const cost = h.shares * h.avgPrice;
    const pnl = value - cost;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    totalValue += value;
    totalCost += cost;
    return [
      h.symbol,
      h.name,
      h.shares.toLocaleString(),
      h.avgPrice.toFixed(2),
      h.currentPrice.toFixed(2),
      value.toFixed(2),
      `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`,
      `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`,
    ];
  });

  const totalPnL = totalValue - totalCost;
  const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  // Summary cards
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND.muted);
  doc.text("TOTAL VALUE", 14, 56);
  doc.text("TOTAL COST", 74, 56);
  doc.text("P/L", 134, 56);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.text(`€${totalValue.toFixed(2)}`, 14, 64);
  doc.text(`€${totalCost.toFixed(2)}`, 74, 64);
  const pnlColor: [number, number, number] = totalPnL >= 0 ? [16, 185, 129] : [239, 68, 68];
  doc.setTextColor(...pnlColor);
  doc.text(`${totalPnL >= 0 ? "+" : ""}€${totalPnL.toFixed(2)} (${totalPnLPct.toFixed(2)}%)`, 134, 64);
  doc.setTextColor(0, 0, 0);

  autoTable(doc, {
    startY: 74,
    head: [["Symbol", "Name", "Shares", "Avg €", "Price €", "Value €", "P/L €", "P/L %"]],
    body: rows,
    headStyles: { fillColor: BRAND.primary, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  // Allocation table
  const allocRows = holdings
    .map((h) => {
      const value = h.shares * h.currentPrice;
      return [h.symbol, h.name, `${((value / totalValue) * 100).toFixed(2)}%`];
    })
    .sort((a, b) => parseFloat(b[2]) - parseFloat(a[2]));

  doc.addPage();
  header(doc, "Allocation Breakdown", "Weight per holding");
  autoTable(doc, {
    startY: 56,
    head: [["Symbol", "Name", "Weight"]],
    body: allocRows,
    headStyles: { fillColor: BRAND.primary, textColor: 255 },
    styles: { fontSize: 10 },
  });

  footer(doc);
  doc.save(`portfolio-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export interface StockReportInput {
  symbol: string;
  name: string;
  price?: number;
  change?: number;
  technicals?: Record<string, string | number | null | undefined>;
  fundamentals?: Record<string, string | number | null | undefined>;
  aiVerdict?: { verdict: string; confidence?: number | string; rationale?: string };
}

function kvTable(doc: jsPDF, startY: number, title: string, obj: Record<string, unknown>) {
  const entries = Object.entries(obj).filter(([, v]) => v != null && v !== "");
  if (entries.length === 0) return startY;
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, startY);
  autoTable(doc, {
    startY: startY + 4,
    body: entries.map(([k, v]) => [k, String(v)]),
    headStyles: { fillColor: BRAND.primary },
    styles: { fontSize: 10 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 70, textColor: BRAND.muted } },
    theme: "plain",
  });
  // @ts-expect-error autotable adds finalY
  return (doc.lastAutoTable?.finalY ?? startY + 20) + 8;
}

export function generateStockReport(input: StockReportInput) {
  const doc = new jsPDF();
  const subtitle = `${input.symbol}${input.name ? ` — ${input.name}` : ""}`;
  header(doc, "Stock Deep Dive", subtitle);

  let y = 56;
  if (input.price != null) {
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text(`€${input.price.toFixed(2)}`, 14, y);
    if (input.change != null) {
      const c: [number, number, number] = input.change >= 0 ? [16, 185, 129] : [239, 68, 68];
      doc.setTextColor(...c);
      doc.setFontSize(14);
      doc.text(`${input.change >= 0 ? "+" : ""}${input.change.toFixed(2)}%`, 60, y);
      doc.setTextColor(0, 0, 0);
    }
    y += 12;
  }

  if (input.technicals) y = kvTable(doc, y, "Technical Indicators", input.technicals);
  if (input.fundamentals) y = kvTable(doc, y, "Fundamentals", input.fundamentals);

  if (input.aiVerdict) {
    if (y > 220) {
      doc.addPage();
      header(doc, "Stock Deep Dive", subtitle);
      y = 56;
    }
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("AI Verdict", 14, y);
    y += 6;
    doc.setFontSize(12);
    doc.setTextColor(...BRAND.accent);
    doc.text(
      `${input.aiVerdict.verdict}${input.aiVerdict.confidence ? ` · ${input.aiVerdict.confidence}` : ""}`,
      14,
      y,
    );
    doc.setTextColor(0, 0, 0);
    if (input.aiVerdict.rationale) {
      y += 8;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(input.aiVerdict.rationale, 180);
      doc.text(lines, 14, y);
    }
  }

  footer(doc);
  doc.save(`${input.symbol}-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}