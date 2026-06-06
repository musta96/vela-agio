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
  doc.text("Vela.ai", 14, 14);
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
  const isIt = (typeof window !== "undefined" && (localStorage.getItem("i18nextLng") ?? "").startsWith("it"));
  const disclaim = isIt ? "Non costituisce consulenza finanziaria" : "Not financial advice";
  const pageLabel = isIt ? "Pagina" : "Page";
  const ofLabel = isIt ? "di" : "of";
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(
      `Vela.ai · ${disclaim} · ${pageLabel} ${i} ${ofLabel} ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" },
    );
  }
}

function disclaimer(doc: jsPDF, y: number) {
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.muted);
  const isIt = (typeof window !== "undefined" && (localStorage.getItem("i18nextLng") ?? "").startsWith("it"));
  const txt = isIt
    ? "Disclaimer: Questo report è generato automaticamente da Vela.ai a soli fini informativi ed educativi. Non costituisce consulenza in materia di investimenti, raccomandazione, né offerta di acquisto o vendita di strumenti finanziari. I dati possono essere ritardati, incompleti o inaccurati. Effettua sempre le tue analisi e consulta un consulente finanziario abilitato prima di prendere decisioni di investimento."
    : "Disclaimer: This report is generated automatically by Vela.ai for informational and educational purposes only. It does not constitute investment advice, a recommendation, or an offer to buy or sell any security. Data may be delayed, incomplete, or inaccurate. Always do your own research and consult a licensed financial advisor before making investment decisions.";
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
  analytics?: {
    vol: number;
    var95: number;
    sharpe: number;
    sortino: number;
    maxDD: number;
    betaMib: number | null;
    betaSpx: number | null;
    hhi: number;
    top3Weight: number;
    diversification: string;
    marketExposure: Array<[string, number]>;
    currencyExposure: Array<[string, number]>;
    topContributors: Array<{ symbol: string; pnl: number; pct: number }>;
    riskContribution: Array<{ symbol: string; contribution: number }>;
    correlation: { symbols: string[]; matrix: number[][] } | null;
  } | null;
}

export function generatePortfolioReport({ holdings, analytics }: PortfolioReportInput) {
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

  // ── Advanced analytics page ──────────────────────────────────────────
  if (analytics) {
    doc.addPage();
    header(doc, "Risk & Diversification", "1Y daily returns, weighted portfolio");
    const pct = (v: number, d = 2) => `${(v * 100).toFixed(d)}%`;
    autoTable(doc, {
      startY: 56,
      head: [["Metric", "Value"]],
      body: [
        ["Annualized volatility", pct(analytics.vol, 1)],
        ["VaR 95% (1-day)", pct(analytics.var95)],
        ["Sharpe ratio", analytics.sharpe.toFixed(2)],
        ["Sortino ratio", analytics.sortino.toFixed(2)],
        ["Max drawdown", pct(analytics.maxDD, 1)],
        ["Beta vs FTSE MIB", analytics.betaMib != null ? analytics.betaMib.toFixed(2) : "—"],
        ["Beta vs S&P 500", analytics.betaSpx != null ? analytics.betaSpx.toFixed(2) : "—"],
        ["Concentration (HHI)", `${analytics.hhi.toFixed(2)} — ${analytics.diversification}`],
        ["Top-3 weight", pct(analytics.top3Weight, 1)],
      ],
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      styles: { fontSize: 10 },
    });

    // @ts-expect-error autotable adds finalY
    let y = (doc.lastAutoTable?.finalY ?? 120) + 10;

    if (analytics.marketExposure.length) {
      autoTable(doc, {
        startY: y,
        head: [["Market exposure", "Weight"]],
        body: analytics.marketExposure.map(([m, w]) => [m, pct(w, 1)]),
        headStyles: { fillColor: BRAND.primary, textColor: 255 },
        styles: { fontSize: 9 },
      });
      // @ts-expect-error autotable adds finalY
      y = (doc.lastAutoTable?.finalY ?? y) + 6;
    }
    if (analytics.currencyExposure.length) {
      autoTable(doc, {
        startY: y,
        head: [["Currency exposure", "Weight"]],
        body: analytics.currencyExposure.map(([c, w]) => [c, pct(w, 1)]),
        headStyles: { fillColor: BRAND.primary, textColor: 255 },
        styles: { fontSize: 9 },
      });
      // @ts-expect-error autotable adds finalY
      y = (doc.lastAutoTable?.finalY ?? y) + 6;
    }
    if (analytics.riskContribution.length) {
      autoTable(doc, {
        startY: y,
        head: [["Risk contribution", "Share of vol"]],
        body: analytics.riskContribution.map((r) => [r.symbol, pct(r.contribution, 1)]),
        headStyles: { fillColor: BRAND.primary, textColor: 255 },
        styles: { fontSize: 9 },
      });
    }

    // Correlation matrix
    if (analytics.correlation && analytics.correlation.symbols.length > 1) {
      doc.addPage();
      header(doc, "Correlation Matrix", "1Y daily returns");
      const syms = analytics.correlation.symbols;
      const body = analytics.correlation.matrix.map((row, i) => [
        syms[i],
        ...row.map((v) => v.toFixed(2)),
      ]);
      autoTable(doc, {
        startY: 56,
        head: [["", ...syms]],
        body,
        headStyles: { fillColor: BRAND.primary, textColor: 255, fontStyle: "bold" },
        styles: { fontSize: 8, halign: "center" },
        columnStyles: { 0: { fontStyle: "bold", halign: "left" } },
        didParseCell: (data) => {
          if (data.section !== "body" || data.column.index === 0) return;
          const v = parseFloat(String(data.cell.raw));
          if (!isFinite(v)) return;
          if (v > 0.7) data.cell.styles.fillColor = [254, 226, 226];
          else if (v > 0.4) data.cell.styles.fillColor = [254, 242, 242];
          else if (v < -0.4) data.cell.styles.fillColor = [220, 252, 231];
        },
      });
      doc.setFontSize(9);
      doc.setTextColor(...BRAND.muted);
      // @ts-expect-error autotable adds finalY
      const yy = (doc.lastAutoTable?.finalY ?? 200) + 6;
      doc.text("Red shading = highly correlated holdings (concentration risk). Green = diversifying.", 14, yy);
      doc.setTextColor(0, 0, 0);
    }
  }

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
    ].filter(([, v]) => v != null && v !== "") as Array<[string, any]>;
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

// =====================================================================
// Goals plan PDF — deep version with inputs, percentiles, year table,
// success probability and actionable interpretation.
// =====================================================================

export interface GoalsPlanReportInput {
  name: string;
  initial: number;
  monthly: number;
  years: number;
  target: number;
  expectedReturn: number; // 0.07 = 7%
  volatility: number;     // 0.15 = 15%
  successProb: number;    // 0..1
  paths: { p10: number[]; median: number[]; p90: number[] }; // monthly arrays
  currency?: string;
}

export interface GoalsPlanReportOptions {
  includeAssumptions?: boolean;   // default true
  includeProbabilityTable?: boolean; // default true
  filename?: string;              // overrides default
  mode?: "save" | "blob";         // save = doc.save; blob = return Blob URL for preview
}

export function buildGoalsPlanFilename(name: string) {
  const slug = name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase() || "plan";
  return `goal-plan-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;
}

export function generateGoalsPlanReport(
  input: GoalsPlanReportInput,
  options: GoalsPlanReportOptions = {},
): { filename: string; blobUrl?: string } {
  const includeAssumptions = options.includeAssumptions ?? true;
  const includeProbabilityTable = options.includeProbabilityTable ?? true;
  const filename = options.filename || buildGoalsPlanFilename(input.name);
  const cur = input.currency ?? "€";
  const doc = new jsPDF();
  const fmt = (n: number) =>
    `${cur}${Math.round(n).toLocaleString("en-US")}`;

  header(doc, "Goal Plan", `${input.name} · ${new Date().toLocaleDateString()}`);
  // filename header strip
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.muted);
  doc.text(`File: ${filename}`, 14, 48);
  doc.setTextColor(0, 0, 0);

  // Inputs summary
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND.muted);
  doc.text("INITIAL", 14, 56);
  doc.text("MONTHLY", 64, 56);
  doc.text("HORIZON", 114, 56);
  doc.text("TARGET", 164, 56);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(13);
  doc.text(fmt(input.initial), 14, 64);
  doc.text(fmt(input.monthly), 64, 64);
  doc.text(`${input.years} yrs`, 114, 64);
  doc.text(fmt(input.target), 164, 64);

  let y = 74;
  if (includeAssumptions) {
    autoTable(doc, {
      startY: 74,
      head: [["Assumption", "Value"]],
      body: [
        ["Expected annual return", `${(input.expectedReturn * 100).toFixed(2)}%`],
        ["Annual volatility (std. dev.)", `${(input.volatility * 100).toFixed(2)}%`],
        ["Simulation trials", "800"],
        ["Contribution timing", "End of month"],
        ["Model", "Geometric Brownian Motion (lognormal monthly returns)"],
      ],
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      styles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    // @ts-expect-error - autoTable adds lastAutoTable to doc
    y = (doc.lastAutoTable?.finalY ?? 100) + 8;
  }

  // Outcome card
  const months = input.paths.median.length;
  const finalMedian = input.paths.median[months - 1] ?? 0;
  const finalP10 = input.paths.p10[months - 1] ?? 0;
  const finalP90 = input.paths.p90[months - 1] ?? 0;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND.muted);
  doc.text("SUCCESS PROBABILITY", 14, y);
  doc.text("MEDIAN OUTCOME", 84, y);
  doc.text("10TH / 90TH PCT", 154, y);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  const okColor: [number, number, number] =
    input.successProb >= 0.7 ? [16, 185, 129] : input.successProb >= 0.4 ? [234, 179, 8] : [239, 68, 68];
  doc.setTextColor(...okColor);
  doc.text(`${Math.round(input.successProb * 100)}%`, 14, y + 8);
  doc.setTextColor(0, 0, 0);
  doc.text(fmt(finalMedian), 84, y + 8);
  doc.setFontSize(11);
  doc.text(`${fmt(finalP10)} / ${fmt(finalP90)}`, 154, y + 8);

  y += 18;

  if (includeProbabilityTable) {
    const yearRows: any[] = [];
    for (let yr = 1; yr <= input.years; yr++) {
      const idx = Math.min(yr * 12 - 1, months - 1);
      yearRows.push([
        `Year ${yr}`,
        fmt(input.paths.p10[idx]),
        fmt(input.paths.median[idx]),
        fmt(input.paths.p90[idx]),
        input.paths.median[idx] >= input.target ? "Reached" : "—",
      ]);
    }
    autoTable(doc, {
      startY: y,
      head: [["Year", "10th pct", "Median", "90th pct", "Target?"]],
      body: yearRows,
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      styles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
  }

  // Interpretation page
  doc.addPage();
  header(doc, "Interpretation", "Educational guidance — not financial advice");

  let iy = 56;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("What this means", 14, iy);
  iy += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const gap = input.target - finalMedian;
  const verdict =
    input.successProb >= 0.7
      ? `Your plan looks on track: in ${Math.round(input.successProb * 100)}% of simulated futures, the portfolio meets or exceeds ${fmt(input.target)} by year ${input.years}.`
      : input.successProb >= 0.4
        ? `Your plan is borderline: only ${Math.round(input.successProb * 100)}% of simulations reach ${fmt(input.target)}. Small changes to contributions, horizon, or risk profile can meaningfully improve odds.`
        : `Your plan is unlikely to reach the target as-is: only ${Math.round(input.successProb * 100)}% of simulations clear ${fmt(input.target)}. Consider raising contributions, extending the horizon, or revisiting your target.`;

  const verdictLines = doc.splitTextToSize(verdict, doc.internal.pageSize.getWidth() - 28);
  doc.text(verdictLines, 14, iy);
  iy += verdictLines.length * 5 + 4;

  // Suggestions
  doc.setFont("helvetica", "bold");
  doc.text("Levers to consider", 14, iy);
  iy += 6;
  doc.setFont("helvetica", "normal");

  const extraMonthly = gap > 0 ? Math.max(50, Math.round(gap / (input.years * 12) / 10) * 10) : 0;
  const levers = [
    extraMonthly > 0
      ? `Increase monthly contribution by roughly ${fmt(extraMonthly)} to close the median gap of ${fmt(Math.max(0, gap))}.`
      : `Median outcome already clears the target — consider locking in gains as the horizon shortens.`,
    `Extending the horizon by 2-3 years typically lifts success probability by 10-20 percentage points at the same contribution.`,
    `Lowering volatility (more bonds / diversification) trims the downside p10 but also reduces the p90 upside.`,
    `Re-run this plan whenever income, target, or market regime changes materially.`,
  ];
  levers.forEach((l) => {
    const lines = doc.splitTextToSize(`• ${l}`, doc.internal.pageSize.getWidth() - 28);
    doc.text(lines, 14, iy);
    iy += lines.length * 5 + 2;
  });

  iy += 4;
  doc.setFont("helvetica", "bold");
  doc.text("Method notes", 14, iy);
  iy += 6;
  doc.setFont("helvetica", "normal");
  const notes =
    "Outcomes are simulated using 800 random paths of monthly returns drawn from a normal distribution with the annual mean and volatility you specified. Returns are compounded and monthly contributions are added end-of-period. Inflation, taxes, fees, and sequence-of-returns risk are not modelled explicitly; treat percentiles as relative guidance rather than precise forecasts.";
  const noteLines = doc.splitTextToSize(notes, doc.internal.pageSize.getWidth() - 28);
  doc.text(noteLines, 14, iy);
  iy += noteLines.length * 5 + 6;

  disclaimer(doc, iy);

  footer(doc);
  if (options.mode === "blob") {
    const blob = doc.output("bloburl");
    return { filename, blobUrl: String(blob) };
  }
  doc.save(filename);
  return { filename };
}