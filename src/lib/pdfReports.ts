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

// ============================================================
// Comparison report (side-by-side multiple tickers)
// ============================================================

export interface ComparisonReportInput {
  tickers: Array<{
    symbol: string;
    name?: string;
    price?: number;
    change?: number; // % change
    composite?: number | null; // technical composite score
    vol?: number | null; // annualized volatility (decimal)
    sharpe?: number | null;
    maxDD?: number | null; // decimal
    perf1Y?: number | null; // total return over period (decimal)
  }>;
  period?: string;
}

export function generateComparisonReport({ tickers, period = "1Y" }: ComparisonReportInput) {
  const doc = new jsPDF({ orientation: tickers.length > 2 ? "landscape" : "portrait" });
  header(doc, "Stock Comparison Report", `${tickers.map((t) => t.symbol).join(" vs ")} — ${period}`);

  const fmtPct = (v?: number | null, mult = 100) =>
    v == null || !isFinite(v as number) ? "—" : `${(v as number) >= 0 ? "+" : ""}${((v as number) * mult).toFixed(2)}%`;
  const fmtNum = (v?: number | null, d = 2) => (v == null || !isFinite(v as number) ? "—" : (v as number).toFixed(d));

  const head = [["Metric", ...tickers.map((t) => t.symbol)]];
  const body = [
    ["Name", ...tickers.map((t) => t.name ?? "—")],
    ["Last price", ...tickers.map((t) => (t.price != null ? t.price.toFixed(2) : "—"))],
    ["Day change", ...tickers.map((t) => fmtPct(t.change, 1))],
    [`Total return (${period})`, ...tickers.map((t) => fmtPct(t.perf1Y))],
    ["Composite score", ...tickers.map((t) => fmtNum(t.composite, 0))],
    ["Volatility (ann.)", ...tickers.map((t) => fmtPct(t.vol))],
    ["Sharpe ratio", ...tickers.map((t) => fmtNum(t.sharpe))],
    ["Max drawdown", ...tickers.map((t) => fmtPct(t.maxDD))],
  ];

  autoTable(doc, {
    startY: 56,
    head,
    body,
    headStyles: { fillColor: BRAND.primary, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 10 },
    columnStyles: { 0: { fontStyle: "bold", textColor: BRAND.muted } },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  // Verdict / ranking heuristic
  // @ts-expect-error
  let y = (doc.lastAutoTable?.finalY ?? 120) + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Quick ranking", 14, y);
  y += 6;
  const scored = tickers
    .map((t) => {
      let s = 0;
      if (t.composite != null) s += t.composite;
      if (t.sharpe != null) s += t.sharpe * 10;
      if (t.perf1Y != null) s += t.perf1Y * 30;
      if (t.maxDD != null) s += t.maxDD * 20; // maxDD is negative
      return { ...t, _score: s };
    })
    .sort((a, b) => b._score - a._score);

  autoTable(doc, {
    startY: y,
    head: [["Rank", "Symbol", "Name", "Composite"]],
    body: scored.map((t, i) => [String(i + 1), t.symbol, t.name ?? "—", t._score.toFixed(1)]),
    headStyles: { fillColor: BRAND.accent, textColor: 255 },
    styles: { fontSize: 10 },
  });

  // @ts-expect-error
  y = (doc.lastAutoTable?.finalY ?? y + 30) + 8;
  if (y > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    y = 20;
  }
  disclaimer(doc, y);
  footer(doc);
  doc.save(`compare-${tickers.map((t) => t.symbol).join("-")}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ============================================================
// Full deep-analysis report (rich, magazine-style stock report)
// ============================================================

export interface DeepAnalysisReportInput {
  symbol: string;
  name?: string;
  generatedAt?: string;
  fundamentals?: Record<string, any>;
  liquidity?: { tier?: string; avgVolume?: number; avgDollarVolume?: number } | null;
  valuation?: {
    dcf?: { perShare: number; upside?: number | null; assumptions?: Record<string, any> } | null;
    ddm?: { perShare: number; upside?: number | null; assumptions?: Record<string, any> } | null;
  };
  analysis?: {
    thesis?: string;
    strengths?: string[];
    risks?: string[];
    moat?: string;
    valuation?: string;
    recommendation?: string;
    horizon?: string;
    scenarios?: {
      bull?: { price: number; probability?: number; rationale?: string };
      base?: { price: number; probability?: number; rationale?: string };
      bear?: { price: number; probability?: number; rationale?: string };
    };
  };
  sentiment?: { label?: string; score?: number; summary?: string } | null;
  technicals?: Record<string, any> | null;
}

function section(doc: jsPDF, y: number, title: string) {
  if (y > doc.internal.pageSize.getHeight() - 30) {
    doc.addPage();
    y = 20;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...BRAND.primary);
  doc.text(title, 14, y);
  doc.setDrawColor(...BRAND.accent);
  doc.setLineWidth(0.5);
  doc.line(14, y + 1.5, 60, y + 1.5);
  doc.setTextColor(0, 0, 0);
  return y + 7;
}

function paragraph(doc: jsPDF, y: number, text: string, opts?: { size?: number; bold?: boolean }) {
  doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
  doc.setFontSize(opts?.size ?? 10);
  const lines = doc.splitTextToSize(text, doc.internal.pageSize.getWidth() - 28);
  if (y + lines.length * 4 > doc.internal.pageSize.getHeight() - 20) {
    doc.addPage();
    y = 20;
  }
  doc.text(lines, 14, y);
  return y + lines.length * 4.5 + 2;
}

function bullets(doc: jsPDF, y: number, items: string[], color: [number, number, number]) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const it of items) {
    const lines = doc.splitTextToSize(it, doc.internal.pageSize.getWidth() - 32);
    if (y + lines.length * 4 > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = 20;
    }
    doc.setTextColor(...color);
    doc.text("•", 16, y);
    doc.setTextColor(0, 0, 0);
    doc.text(lines, 21, y);
    y += lines.length * 4.5 + 1;
  }
  return y + 2;
}

export function generateDeepAnalysisReport(input: DeepAnalysisReportInput) {
  const doc = new jsPDF();
  const subtitle = `${input.symbol}${input.name ? ` — ${input.name}` : ""}`;
  header(doc, "Deep Stock Analysis", subtitle);

  let y = 50;
  const f = input.fundamentals ?? {};
  const currency = f.currency || "EUR";
  const sym = currency === "USD" ? "$" : currency === "GBP" ? "£" : "€";

  // Header strip
  doc.setFillColor(248, 250, 252);
  doc.rect(10, y, doc.internal.pageSize.getWidth() - 20, 22, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.muted);
  doc.text("PRICE", 14, y + 6);
  doc.text("MARKET CAP", 60, y + 6);
  doc.text("SECTOR", 110, y + 6);
  doc.text("ANALYST TARGET", 160, y + 6);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.text(f.price != null ? `${sym}${Number(f.price).toFixed(2)}` : "—", 14, y + 14);
  doc.text(f.marketCap != null ? `${sym}${(f.marketCap / 1e9).toFixed(2)}B` : "—", 60, y + 14);
  doc.text(String(f.sector ?? "—").slice(0, 18), 110, y + 14);
  doc.text(f.targetMeanPrice != null ? `${sym}${Number(f.targetMeanPrice).toFixed(2)}` : "—", 160, y + 14);
  y += 30;

  // Thesis
  if (input.analysis?.thesis) {
    y = section(doc, y, "Investment thesis");
    y = paragraph(doc, y, input.analysis.thesis);
  }

  // Recommendation
  if (input.analysis?.recommendation) {
    y = section(doc, y, "Recommendation");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...BRAND.accent);
    doc.text(
      `${input.analysis.recommendation}${input.analysis.horizon ? `  ·  Horizon: ${input.analysis.horizon}` : ""}`,
      14,
      y,
    );
    doc.setTextColor(0, 0, 0);
    y += 8;
  }

  // Scenarios
  if (input.analysis?.scenarios) {
    y = section(doc, y, "Price scenarios");
    const sc = input.analysis.scenarios;
    const rows: any[] = [];
    (["bull", "base", "bear"] as const).forEach((k) => {
      const s = sc[k];
      if (s)
        rows.push([
          k.toUpperCase(),
          `${sym}${Number(s.price).toFixed(2)}`,
          s.probability != null ? `${(s.probability * 100).toFixed(0)}%` : "—",
          s.rationale ?? "",
        ]);
    });
    autoTable(doc, {
      startY: y,
      head: [["Scenario", "Target", "Prob.", "Rationale"]],
      body: rows,
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: { 3: { cellWidth: 100 } },
    });
    // @ts-expect-error
    y = (doc.lastAutoTable?.finalY ?? y + 30) + 6;
  }

  // Strengths & risks
  if (input.analysis?.strengths?.length) {
    y = section(doc, y, "Strengths");
    y = bullets(doc, y, input.analysis.strengths, [16, 185, 129]);
  }
  if (input.analysis?.risks?.length) {
    y = section(doc, y, "Key risks");
    y = bullets(doc, y, input.analysis.risks, [239, 68, 68]);
  }
  if (input.analysis?.moat) {
    y = section(doc, y, "Competitive moat");
    y = paragraph(doc, y, input.analysis.moat);
  }
  if (input.analysis?.valuation) {
    y = section(doc, y, "Valuation view");
    y = paragraph(doc, y, input.analysis.valuation);
  }

  // Intrinsic value models
  if (input.valuation && (input.valuation.dcf || input.valuation.ddm)) {
    y = section(doc, y, "Intrinsic value models");
    const rows: any[] = [];
    if (input.valuation.dcf)
      rows.push([
        "DCF (10y)",
        `${sym}${input.valuation.dcf.perShare.toFixed(2)}`,
        input.valuation.dcf.upside != null
          ? `${input.valuation.dcf.upside >= 0 ? "+" : ""}${(input.valuation.dcf.upside * 100).toFixed(1)}%`
          : "—",
      ]);
    if (input.valuation.ddm)
      rows.push([
        "Dividend discount",
        `${sym}${input.valuation.ddm.perShare.toFixed(2)}`,
        input.valuation.ddm.upside != null
          ? `${input.valuation.ddm.upside >= 0 ? "+" : ""}${(input.valuation.ddm.upside * 100).toFixed(1)}%`
          : "—",
      ]);
    autoTable(doc, {
      startY: y,
      head: [["Model", "Fair value", "Upside vs price"]],
      body: rows,
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      styles: { fontSize: 10 },
    });
    // @ts-expect-error
    y = (doc.lastAutoTable?.finalY ?? y + 20) + 6;
  }

  // Fundamentals snapshot
  if (input.fundamentals) {
    const labels: Array<[string, any]> = [
      ["Market cap", f.marketCap != null ? `${sym}${(f.marketCap / 1e9).toFixed(2)}B` : null],
      ["P/E (TTM)", f.peTrailing],
      ["Forward P/E", f.peForward],
      ["PEG", f.pegRatio],
      ["P/B", f.priceToBook],
      ["EV/EBITDA", f.evToEbitda],
      ["Dividend yield", f.dividendYield != null ? `${(f.dividendYield * 100).toFixed(2)}%` : null],
      ["Payout ratio", f.payoutRatio != null ? `${(f.payoutRatio * 100).toFixed(1)}%` : null],
      ["ROE", f.returnOnEquity != null ? `${(f.returnOnEquity * 100).toFixed(1)}%` : null],
      ["ROA", f.returnOnAssets != null ? `${(f.returnOnAssets * 100).toFixed(1)}%` : null],
      ["Gross margin", f.grossMargin != null ? `${(f.grossMargin * 100).toFixed(1)}%` : null],
      ["Operating margin", f.operatingMargin != null ? `${(f.operatingMargin * 100).toFixed(1)}%` : null],
      ["Profit margin", f.profitMargin != null ? `${(f.profitMargin * 100).toFixed(1)}%` : null],
      ["Revenue growth", f.revenueGrowth != null ? `${(f.revenueGrowth * 100).toFixed(1)}%` : null],
      ["Earnings growth", f.earningsGrowth != null ? `${(f.earningsGrowth * 100).toFixed(1)}%` : null],
      ["Debt / Equity", f.debtToEquity],
      ["Current ratio", f.currentRatio],
      ["Beta", f.beta],
      ["52w high", f.fiftyTwoWeekHigh],
      ["52w low", f.fiftyTwoWeekLow],
    ].filter(([, v]) => v != null && v !== "");
    if (labels.length) {
      y = section(doc, y, "Fundamentals snapshot");
      autoTable(doc, {
        startY: y,
        body: labels.map(([k, v]) => [k, String(typeof v === "number" ? Number(v).toFixed(2) : v)]),
        styles: { fontSize: 9 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 60, textColor: BRAND.muted } },
        theme: "striped",
      });
      // @ts-expect-error
      y = (doc.lastAutoTable?.finalY ?? y + 30) + 6;
    }
  }

  // Liquidity
  if (input.liquidity) {
    y = section(doc, y, "Liquidity profile");
    const rows = [
      ["Tier", input.liquidity.tier ?? "—"],
      ["Avg daily volume", input.liquidity.avgVolume?.toLocaleString() ?? "—"],
      [
        "Avg daily $-volume",
        input.liquidity.avgDollarVolume != null
          ? `${sym}${(input.liquidity.avgDollarVolume / 1e6).toFixed(2)}M`
          : "—",
      ],
    ];
    autoTable(doc, {
      startY: y,
      body: rows,
      styles: { fontSize: 10 },
      columnStyles: { 0: { fontStyle: "bold", textColor: BRAND.muted, cellWidth: 60 } },
      theme: "plain",
    });
    // @ts-expect-error
    y = (doc.lastAutoTable?.finalY ?? y + 20) + 6;
  }

  // Sentiment
  if (input.sentiment) {
    y = section(doc, y, "Market sentiment");
    if (input.sentiment.label) y = paragraph(doc, y, `Label: ${input.sentiment.label}`, { bold: true });
    if (input.sentiment.summary) y = paragraph(doc, y, input.sentiment.summary);
  }

  // Technicals
  if (input.technicals && Object.keys(input.technicals).length) {
    y = section(doc, y, "Technical indicators");
    autoTable(doc, {
      startY: y,
      body: Object.entries(input.technicals)
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => [k, String(v)]),
      styles: { fontSize: 9 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 60, textColor: BRAND.muted } },
      theme: "striped",
    });
    // @ts-expect-error
    y = (doc.lastAutoTable?.finalY ?? y + 30) + 6;
  }

  // Disclaimer
  if (y > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    y = 20;
  } else {
    y += 4;
  }
  y = section(doc, y, "Important disclaimer");
  disclaimer(doc, y);

  footer(doc);
  doc.save(`${input.symbol}-deep-analysis-${new Date().toISOString().slice(0, 10)}.pdf`);
}