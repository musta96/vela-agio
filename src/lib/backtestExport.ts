import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface BacktestResult {
  strategy: string;
  range: string;
  holdings: string[];
  equity: { t: number; value: number; benchmark: number }[];
  trades: { date: string; type: "BUY" | "SELL"; price: number; shares: number }[];
  metrics: {
    finalValue: number; totalReturn: number; benchReturn: number;
    maxDrawdown: number; sharpe: number; winRate: number;
    totalTrades: number; winningTrades: number;
  };
}

const STRATEGY_LABELS: Record<string, string> = {
  buy_hold: "Buy & Hold",
  sma_cross: "SMA 20/50 Crossover",
  rsi: "RSI Mean Reversion (30/70)",
};

const slug = (r: BacktestResult) =>
  `${r.holdings.join("-")}_${r.strategy}_${r.range}_${new Date().toISOString().slice(0, 10)}`
    .replace(/[^a-zA-Z0-9_\-]/g, "_");

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

const csvEscape = (v: unknown): string => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map(csvEscape).join(",")).join("\n");

export function exportBacktestCsv(result: BacktestResult) {
  const strategyLabel = STRATEGY_LABELS[result.strategy] || result.strategy;
  const sections: string[] = [];

  sections.push(
    toCsv([
      ["Backtest Report"],
      ["Generated", new Date().toISOString()],
      ["Strategy", strategyLabel],
      ["Range", result.range],
      ["Holdings", result.holdings.join(" | ")],
    ])
  );

  sections.push(
    "KPIs\n" +
      toCsv([
        ["Metric", "Value"],
        ["Final Value", result.metrics.finalValue.toFixed(2)],
        ["Total Return (%)", result.metrics.totalReturn.toFixed(2)],
        ["Buy & Hold Return (%)", result.metrics.benchReturn.toFixed(2)],
        ["Sharpe Ratio", result.metrics.sharpe.toFixed(2)],
        ["Max Drawdown (%)", result.metrics.maxDrawdown.toFixed(2)],
        ["Win Rate (%)", result.metrics.winRate.toFixed(2)],
        ["Total Trades", result.metrics.totalTrades],
        ["Winning Trades", result.metrics.winningTrades],
      ])
  );

  sections.push(
    "Equity Curve\n" +
      toCsv([
        ["Date", "Portfolio", "Benchmark"],
        ...result.equity.map((e) => [
          new Date(e.t).toISOString().slice(0, 10),
          e.value.toFixed(2),
          e.benchmark.toFixed(2),
        ]),
      ])
  );

  sections.push(
    "Trade Log\n" +
      toCsv([
        ["Date", "Type", "Price", "Shares"],
        ...result.trades.map((t) => [t.date, t.type, t.price.toFixed(4), t.shares.toFixed(4)]),
      ])
  );

  const blob = new Blob([sections.join("\n\n")], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, `backtest_${slug(result)}.csv`);
}

export function exportBacktestPdf(result: BacktestResult, chartDataUrl?: string) {
  const strategyLabel = STRATEGY_LABELS[result.strategy] || result.strategy;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Backtest Report", margin, 50);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 68);
  doc.setTextColor(0);

  // Meta
  doc.setFontSize(11);
  let y = 96;
  const meta: [string, string][] = [
    ["Strategy", strategyLabel],
    ["Period", result.range],
    ["Holdings", result.holdings.join(", ")],
  ];
  meta.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(v, margin + 70, y, { maxWidth: pageWidth - margin * 2 - 70 });
    y += 16;
  });

  // KPI table
  autoTable(doc, {
    startY: y + 8,
    head: [["KPI", "Value"]],
    body: [
      ["Final Value", result.metrics.finalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })],
      ["Total Return", `${result.metrics.totalReturn.toFixed(2)}%`],
      ["Buy & Hold Return", `${result.metrics.benchReturn.toFixed(2)}%`],
      ["Sharpe Ratio", result.metrics.sharpe.toFixed(2)],
      ["Max Drawdown", `${result.metrics.maxDrawdown.toFixed(2)}%`],
      ["Win Rate", `${result.metrics.winRate.toFixed(2)}%`],
      ["Total Trades", String(result.metrics.totalTrades)],
      ["Winning Trades", String(result.metrics.winningTrades)],
    ],
    theme: "striped",
    headStyles: { fillColor: [15, 27, 61] },
    styles: { fontSize: 10 },
    margin: { left: margin, right: margin },
  });

  // Equity curve chart image
  if (chartDataUrl) {
    const afterTableY = (doc as any).lastAutoTable.finalY + 20;
    const remaining = doc.internal.pageSize.getHeight() - afterTableY - margin;
    const imgWidth = pageWidth - margin * 2;
    const imgHeight = Math.min(220, remaining);
    if (imgHeight < 120) {
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("Equity Curve", margin, 50);
      doc.addImage(chartDataUrl, "PNG", margin, 70, imgWidth, 260);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("Equity Curve", margin, afterTableY);
      doc.addImage(chartDataUrl, "PNG", margin, afterTableY + 8, imgWidth, imgHeight);
    }
  }

  // Trade log
  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`Trade Log (${result.trades.length})`, margin, 50);
  autoTable(doc, {
    startY: 64,
    head: [["Date", "Type", "Price", "Shares"]],
    body: result.trades.length
      ? result.trades.map((t) => [t.date, t.type, t.price.toFixed(2), t.shares.toFixed(2)])
      : [["-", "-", "-", "No trades executed"]],
    theme: "grid",
    headStyles: { fillColor: [15, 27, 61] },
    styles: { fontSize: 9 },
    margin: { left: margin, right: margin },
  });

  // Equity data table on new page (summary, sampled)
  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Equity Curve Data", margin, 50);
  const step = Math.max(1, Math.floor(result.equity.length / 60));
  const sampled = result.equity.filter((_, i) => i % step === 0 || i === result.equity.length - 1);
  autoTable(doc, {
    startY: 64,
    head: [["Date", "Portfolio", "Benchmark"]],
    body: sampled.map((e) => [
      new Date(e.t).toISOString().slice(0, 10),
      e.value.toFixed(2),
      e.benchmark.toFixed(2),
    ]),
    theme: "striped",
    headStyles: { fillColor: [15, 27, 61] },
    styles: { fontSize: 9 },
    margin: { left: margin, right: margin },
  });

  doc.save(`backtest_${slug(result)}.pdf`);
}
