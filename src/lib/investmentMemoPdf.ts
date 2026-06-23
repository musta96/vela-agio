import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Formal Investment Memo PDF.
 *
 * Designed to be populated from the copilot's `generate_investment_memo`
 * tool, which itself stitches together live quote data, fundamentals,
 * valuation, and the model's thesis/risks/scenarios. Style matches the
 * other Vela reports (navy header band, muted footer, autoTable bodies).
 */

const BRAND = {
  primary: [13, 71, 161] as [number, number, number],
  accent: [20, 184, 166] as [number, number, number],
  bull: [22, 163, 74] as [number, number, number],
  bear: [220, 38, 38] as [number, number, number],
  warn: [202, 138, 4] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
};

export type MemoRecommendation = "buy" | "accumulate" | "hold" | "reduce" | "sell";
export type MemoConviction = "low" | "medium" | "high";

export interface MemoScenario {
  label: string;            // "Base", "Bull", "Bear"
  target: number;           // price target
  probability?: number;     // 0-1
  rationale?: string;
}

export interface MemoMetric {
  label: string;
  value: string;
}

export interface InvestmentMemoData {
  symbol: string;
  name: string;
  asOf?: string;                       // ISO timestamp
  currency?: string;
  price?: number;
  recommendation: MemoRecommendation;
  conviction?: MemoConviction;
  horizon?: string;                    // "12 months"
  targetPrice?: number;
  upsidePct?: number;                  // computed if absent
  thesis: string;                      // markdown-stripped paragraph(s)
  bullCase?: string;
  bearCase?: string;
  catalysts?: string[];
  risks?: string[];
  keyMetrics?: MemoMetric[];           // P/E, EV/EBITDA, yield, growth…
  valuation?: {
    fairValue?: number;
    method?: string;                   // "DCF", "DDM", "Multiples"
    upsidePct?: number;
    range?: { low: number; high: number };
  };
  scenarios?: MemoScenario[];
  sources?: string[];                  // free-form references
  analystNote?: string;                // optional preamble from advisor/user
}

const RECO_STYLE: Record<MemoRecommendation, { label: string; color: [number, number, number] }> = {
  buy:        { label: "BUY",        color: BRAND.bull },
  accumulate: { label: "ACCUMULATE", color: BRAND.bull },
  hold:       { label: "HOLD",       color: BRAND.muted },
  reduce:     { label: "REDUCE",     color: BRAND.warn },
  sell:       { label: "SELL",       color: BRAND.bear },
};

function header(doc: jsPDF, memo: InvestmentMemoData) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 0, w, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Vela.ai", 14, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Investment Memo", w / 2, 14, { align: "center" });
  doc.text(new Date(memo.asOf ?? Date.now()).toLocaleString(), w - 14, 14, { align: "right" });
  doc.setTextColor(0, 0, 0);
}

function footer(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(
      `Vela.ai · Educational research only · Not financial advice · Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" },
    );
  }
}

function recoBadge(doc: jsPDF, x: number, y: number, reco: MemoRecommendation, conviction?: MemoConviction) {
  const cfg = RECO_STYLE[reco];
  const label = cfg.label;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const w = doc.getTextWidth(label) + 12;
  doc.setFillColor(...cfg.color);
  doc.roundedRect(x, y - 6, w, 9, 1.5, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(label, x + 6, y + 0.5);
  if (conviction) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.muted);
    doc.text(`Conviction: ${conviction.toUpperCase()}`, x + w + 4, y + 0.5);
  }
  doc.setTextColor(0, 0, 0);
}

function sectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...BRAND.primary);
  doc.text(title, 14, y);
  doc.setDrawColor(...BRAND.primary);
  doc.setLineWidth(0.4);
  doc.line(14, y + 1.5, doc.internal.pageSize.getWidth() - 14, y + 1.5);
  doc.setTextColor(0, 0, 0);
  return y + 6;
}

function paragraph(doc: jsPDF, text: string, y: number, font: "normal" | "italic" = "normal"): number {
  doc.setFont("helvetica", font);
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  const w = doc.internal.pageSize.getWidth() - 28;
  const cleaned = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(?!\s)([^*\n]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
  const lines = doc.splitTextToSize(cleaned, w);
  ensureSpace(doc, lines.length * 4.5 + 2);
  doc.text(lines, 14, y);
  return y + lines.length * 4.5 + 2;
}

function bullets(doc: jsPDF, items: string[], y: number, tone?: "good" | "bad"): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const color = tone === "good" ? BRAND.bull : tone === "bad" ? BRAND.bear : BRAND.muted;
  const w = doc.internal.pageSize.getWidth() - 32;
  for (const it of items) {
    const lines = doc.splitTextToSize(it, w);
    ensureSpace(doc, lines.length * 4.5 + 1);
    doc.setTextColor(...color);
    doc.text("•", 16, y);
    doc.setTextColor(30, 30, 30);
    doc.text(lines, 22, y);
    y += lines.length * 4.5 + 1;
  }
  return y + 2;
}

function ensureSpace(doc: jsPDF, needed: number) {
  // Used inside paragraph/bullets — callers that know exact y should test directly.
  const h = doc.internal.pageSize.getHeight();
  // We don't have current y here so this is a soft check used after autoTable.
  // Page-break for paragraph is enforced by jsPDF.splitTextToSize + manual check at section starts.
  void needed;
  void h;
}

function fmtMoney(v: number | undefined, ccy = "USD"): string {
  if (v == null || !Number.isFinite(v)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: ccy, maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${ccy} ${v.toFixed(2)}`;
  }
}
function fmtPct(v: number | undefined, d = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
}

function newPageIfNeeded(doc: jsPDF, y: number, needed = 30): number {
  if (y + needed > doc.internal.pageSize.getHeight() - 18) {
    doc.addPage();
    return 28;
  }
  return y;
}

export interface GenerateMemoOptions {
  /** "save" = trigger browser download; "blob" = return blob URL. Defaults to "save". */
  mode?: "save" | "blob";
  /** Override filename. */
  filename?: string;
}

export function buildMemoFilename(memo: InvestmentMemoData): string {
  const sym = memo.symbol.replace(/[^A-Z0-9._-]/gi, "");
  const d = new Date(memo.asOf ?? Date.now()).toISOString().slice(0, 10);
  return `vela-memo-${sym}-${d}.pdf`;
}

export function generateInvestmentMemo(
  memo: InvestmentMemoData,
  opts: GenerateMemoOptions = {},
): { filename: string; blobUrl?: string } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  header(doc, memo);

  // ----- Title block -----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42);
  doc.text(`${memo.name}`, 14, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.muted);
  const ticker = `${memo.symbol}${memo.currency ? ` · ${memo.currency}` : ""}${typeof memo.price === "number" ? ` · ${fmtMoney(memo.price, memo.currency ?? "USD")}` : ""}`;
  doc.text(ticker, 14, 41);

  recoBadge(doc, w - 14 - 60, 38, memo.recommendation, memo.conviction);

  // ----- Headline KPIs -----
  const upside = memo.upsidePct
    ?? (memo.targetPrice && memo.price ? (memo.targetPrice - memo.price) / memo.price : undefined);
  const kpis: [string, string][] = [
    ["Target", fmtMoney(memo.targetPrice, memo.currency ?? "USD")],
    ["Upside", fmtPct(upside, 1)],
    ["Horizon", memo.horizon ?? "12 months"],
    ["Fair value", fmtMoney(memo.valuation?.fairValue, memo.currency ?? "USD")],
  ];
  let y = 50;
  const cellW = (w - 28) / kpis.length;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  for (let i = 0; i < kpis.length; i++) {
    const x = 14 + i * cellW;
    doc.roundedRect(x, y, cellW - 2, 14, 1.5, 1.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(kpis[i][0].toUpperCase(), x + 3, y + 4.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(kpis[i][1], x + 3, y + 11);
  }
  y += 20;

  // ----- Executive summary -----
  y = sectionTitle(doc, "Executive Summary", y);
  if (memo.analystNote) {
    y = paragraph(doc, memo.analystNote, y, "italic");
    y += 1;
  }
  y = paragraph(doc, memo.thesis || "—", y);

  // ----- Key metrics table -----
  if (memo.keyMetrics && memo.keyMetrics.length) {
    y = newPageIfNeeded(doc, y, 40);
    y = sectionTitle(doc, "Key Metrics", y);
    const rows = memo.keyMetrics.map((m) => [m.label, m.value]);
    autoTable(doc, {
      startY: y,
      head: [["Metric", "Value"]],
      body: rows,
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ----- Valuation -----
  if (memo.valuation) {
    y = newPageIfNeeded(doc, y, 30);
    y = sectionTitle(doc, "Valuation", y);
    const v = memo.valuation;
    const rows: [string, string][] = [];
    if (v.method) rows.push(["Method", v.method]);
    if (v.fairValue != null) rows.push(["Fair value", fmtMoney(v.fairValue, memo.currency ?? "USD")]);
    if (v.range) rows.push(["Range", `${fmtMoney(v.range.low, memo.currency ?? "USD")} – ${fmtMoney(v.range.high, memo.currency ?? "USD")}`]);
    if (v.upsidePct != null) rows.push(["Implied upside", fmtPct(v.upsidePct, 1)]);
    autoTable(doc, {
      startY: y,
      body: rows,
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: "bold", textColor: BRAND.muted, cellWidth: 50 }, 1: { halign: "right" } },
      theme: "plain",
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ----- Bull / Bear case -----
  if (memo.bullCase || memo.bearCase) {
    y = newPageIfNeeded(doc, y, 30);
    y = sectionTitle(doc, "Bull vs Bear Case", y);
    if (memo.bullCase) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...BRAND.bull);
      doc.text("Bull case", 14, y);
      y += 5;
      y = paragraph(doc, memo.bullCase, y);
    }
    if (memo.bearCase) {
      y = newPageIfNeeded(doc, y, 20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...BRAND.bear);
      doc.text("Bear case", 14, y);
      y += 5;
      y = paragraph(doc, memo.bearCase, y);
    }
  }

  // ----- Catalysts -----
  if (memo.catalysts && memo.catalysts.length) {
    y = newPageIfNeeded(doc, y, 30);
    y = sectionTitle(doc, "Catalysts", y);
    y = bullets(doc, memo.catalysts, y, "good");
  }

  // ----- Risks -----
  if (memo.risks && memo.risks.length) {
    y = newPageIfNeeded(doc, y, 30);
    y = sectionTitle(doc, "Key Risks", y);
    y = bullets(doc, memo.risks, y, "bad");
  }

  // ----- Scenarios -----
  if (memo.scenarios && memo.scenarios.length) {
    y = newPageIfNeeded(doc, y, 40);
    y = sectionTitle(doc, "Scenarios", y);
    autoTable(doc, {
      startY: y,
      head: [["Scenario", "Target", "Probability", "Rationale"]],
      body: memo.scenarios.map((s) => [
        s.label,
        fmtMoney(s.target, memo.currency ?? "USD"),
        s.probability != null ? `${Math.round(s.probability * 100)}%` : "—",
        s.rationale ?? "",
      ]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { cellWidth: 80 } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ----- Sources -----
  if (memo.sources && memo.sources.length) {
    y = newPageIfNeeded(doc, y, 30);
    y = sectionTitle(doc, "Sources & Data", y);
    y = bullets(doc, memo.sources, y);
  }

  // ----- Disclaimer -----
  y = newPageIfNeeded(doc, y, 30);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.muted);
  const disclaim = "This memo is generated automatically by Vela.ai for informational and educational purposes only. It does not constitute investment advice, a recommendation, or an offer to buy or sell any security. Data may be delayed, incomplete, or inaccurate. Always do your own research and consult a licensed financial advisor before making investment decisions.";
  const lines = doc.splitTextToSize(disclaim, w - 28);
  doc.text(lines, 14, y);

  footer(doc);

  const filename = opts.filename ?? buildMemoFilename(memo);
  if (opts.mode === "blob") {
    const blob = doc.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    return { filename, blobUrl };
  }
  doc.save(filename);
  return { filename };
}