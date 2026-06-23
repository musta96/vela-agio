import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  returns as toReturns,
  valueAtRisk,
  expectedShortfall,
  stdev,
  mean,
  maxDrawdown,
  sharpeRatio,
  TRADING_DAYS,
} from "@/lib/riskMetrics";
import {
  MACRO_SCENARIOS,
  applyMacroScenario,
  quantile,
  type ScenarioImpact,
} from "@/lib/quantScenarios";
import { getInstrumentMeta } from "@/lib/instrumentMeta";

/**
 * Portfolio-level Investment Memo PDF.
 *
 * Distinct from the single-instrument `investmentMemoPdf.ts` — this report
 * spans every holding in a portfolio and stitches together:
 *   - cover with totals + recommendation strip
 *   - holdings table with weights and P/L
 *   - asset class / sector / geography allocation breakdowns
 *   - per-instrument mini-thesis cards
 *   - historical risk metrics (vol, VaR, CVaR, max DD, Sharpe)
 *   - Monte Carlo bootstrap (P5/P50/P95 + percentile table)
 *   - macro scenario stress matrix
 *   - meta-derived co-movement matrix
 *   - recommended actions & disclaimer
 *
 * Everything renders as long as `holdings` is non-empty; sections that need
 * an `equity` series degrade gracefully when omitted.
 */

const BRAND = {
  primary: [13, 71, 161] as [number, number, number],
  accent: [20, 184, 166] as [number, number, number],
  bull: [22, 163, 74] as [number, number, number],
  bear: [220, 38, 38] as [number, number, number],
  warn: [202, 138, 4] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  surface: [248, 250, 252] as [number, number, number],
};

export interface PortfolioMemoHolding {
  symbol: string;
  name?: string;
  shares?: number;
  avgPrice?: number;
  currentPrice?: number;
  weight?: number;       // 0..1, recomputed if missing
  value?: number;        // currency, recomputed if missing
  currency?: string;
  thesis?: string;
  rating?: "buy" | "hold" | "sell" | "accumulate" | "reduce";
}

export interface PortfolioEquityPoint {
  t: number; // ms
  value: number;
}

export interface PortfolioMemoInput {
  portfolioName?: string;
  asOf?: string | number;
  currency?: string;       // base currency, e.g. "EUR"
  holdings: PortfolioMemoHolding[];
  equity?: PortfolioEquityPoint[];
  /** Optional benchmark name/return for context. */
  benchmark?: { label: string; totalReturnPct?: number };
  /** Free-form analyst preamble shown under the executive summary. */
  analystNote?: string;
  /** Override Monte Carlo defaults. */
  mcConfig?: { horizonDays?: number; paths?: number; seed?: number };
  /** Confidence levels for the VaR/CVaR table. Defaults to [0.95, 0.99]. */
  confidences?: number[];
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bootstrap(rets: number[], start: number, horizon: number, paths: number, seed: number): number[] {
  if (!rets.length || start <= 0) return [];
  const rand = rng(seed);
  const finals: number[] = [];
  for (let p = 0; p < paths; p++) {
    let v = start;
    for (let d = 0; d < horizon; d++) v *= 1 + rets[Math.floor(rand() * rets.length)];
    finals.push(v);
  }
  return finals;
}

function fmtMoney(v: number | undefined, ccy: string): string {
  if (v == null || !Number.isFinite(v)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(v);
  } catch {
    return `${ccy} ${v.toFixed(0)}`;
  }
}
function fmtPct(v: number | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
}
function fmtWeight(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function header(doc: jsPDF, title: string, asOf: number) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 0, w, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Vela.ai", 14, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(title, w / 2, 14, { align: "center" });
  doc.text(new Date(asOf).toLocaleString(), w - 14, 14, { align: "right" });
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
  const lines = doc.splitTextToSize(String(text ?? ""), w);
  doc.text(lines, 14, y);
  return y + lines.length * 4.5 + 2;
}

function newPageIfNeeded(doc: jsPDF, y: number, needed = 30): number {
  if (y + needed > doc.internal.pageSize.getHeight() - 18) {
    doc.addPage();
    return 28;
  }
  return y;
}

function lastTableY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

function normaliseWeights(holdings: PortfolioMemoHolding[]): PortfolioMemoHolding[] {
  const enriched = holdings.map((h) => {
    const value =
      h.value ??
      (h.shares != null && h.currentPrice != null ? h.shares * h.currentPrice : undefined);
    return { ...h, value: value ?? 0 };
  });
  const total = enriched.reduce((s, h) => s + (h.value ?? 0), 0);
  if (total <= 0) {
    const n = enriched.length || 1;
    return enriched.map((h) => ({ ...h, weight: h.weight ?? 1 / n }));
  }
  return enriched.map((h) => ({ ...h, weight: h.weight ?? (h.value ?? 0) / total }));
}

function aggregateBy(
  holdings: PortfolioMemoHolding[],
  key: (h: PortfolioMemoHolding) => string,
): { label: string; weight: number; value: number }[] {
  const map = new Map<string, { weight: number; value: number }>();
  holdings.forEach((h) => {
    const k = key(h);
    const cur = map.get(k) ?? { weight: 0, value: 0 };
    cur.weight += h.weight ?? 0;
    cur.value += h.value ?? 0;
    map.set(k, cur);
  });
  return [...map.entries()]
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.weight - a.weight);
}

function buildCoMovement(holdings: PortfolioMemoHolding[]) {
  const metas = holdings.map((h) => ({ h, m: getInstrumentMeta(h.symbol) }));
  const matrix = metas.map((a) =>
    metas.map((b) => {
      if (a.h.symbol === b.h.symbol) return 1;
      let score = 0.05;
      if (a.m.assetClass === b.m.assetClass) score += 0.4;
      if (a.m.sector === b.m.sector) score += 0.35;
      if (a.m.geography === b.m.geography) score += 0.15;
      return Math.min(0.95, score);
    }),
  );
  let sum = 0;
  let n = 0;
  for (let i = 0; i < matrix.length; i++) {
    for (let j = i + 1; j < matrix.length; j++) { sum += matrix[i][j]; n++; }
  }
  return { matrix, symbols: holdings.map((h) => h.symbol), avg: n ? sum / n : 0 };
}

function herfindahl(items: { weight: number }[]): number {
  return items.reduce((s, i) => s + i.weight * i.weight, 0);
}

function diversificationVerdict(hhi: number): { label: string; tone: "good" | "warn" | "bad" } {
  if (hhi > 0.55) return { label: "Highly concentrated", tone: "bad" };
  if (hhi > 0.30) return { label: "Moderately concentrated", tone: "warn" };
  return { label: "Well diversified", tone: "good" };
}

export function buildPortfolioMemoFilename(input: PortfolioMemoInput): string {
  const name = (input.portfolioName ?? "portfolio").replace(/[^a-zA-Z0-9_\-]/g, "_");
  const d = new Date(typeof input.asOf === "string" ? Date.parse(input.asOf) : (input.asOf ?? Date.now()))
    .toISOString().slice(0, 10);
  return `vela-portfolio-memo-${name}-${d}.pdf`;
}

export function generatePortfolioInvestmentMemo(input: PortfolioMemoInput): { filename: string } {
  const currency = input.currency ?? "EUR";
  const asOf = typeof input.asOf === "string" ? Date.parse(input.asOf) : (input.asOf ?? Date.now());
  const holdings = normaliseWeights(input.holdings);
  const totalValue = holdings.reduce((s, h) => s + (h.value ?? 0), 0);
  const totalCost = holdings.reduce(
    (s, h) => s + ((h.shares != null && h.avgPrice != null) ? h.shares * h.avgPrice : 0),
    0,
  );
  const unrealisedPnl = totalCost > 0 ? totalValue - totalCost : 0;
  const unrealisedPct = totalCost > 0 ? unrealisedPnl / totalCost : undefined;

  // Allocation aggregates.
  const byAssetClass = aggregateBy(holdings, (h) => getInstrumentMeta(h.symbol).assetClass);
  const bySector = aggregateBy(holdings, (h) => getInstrumentMeta(h.symbol).sector);
  const byGeography = aggregateBy(holdings, (h) => getInstrumentMeta(h.symbol).geography);
  const hhi = {
    holdings: herfindahl(holdings.map((h) => ({ weight: h.weight ?? 0 }))),
    assetClass: herfindahl(byAssetClass),
    sector: herfindahl(bySector),
    geography: herfindahl(byGeography),
  };

  // Risk + Monte Carlo from equity series.
  const closes = (input.equity ?? []).map((e) => e.value).filter((v) => Number.isFinite(v) && v > 0);
  const rets = closes.length > 1 ? toReturns(closes) : [];
  const horizonDays = input.mcConfig?.horizonDays ?? 252;
  const paths = input.mcConfig?.paths ?? 1500;
  const seed = input.mcConfig?.seed ?? 42;
  const startValue = totalValue > 0 ? totalValue : (closes[closes.length - 1] ?? 0);
  const finals = rets.length >= 20 ? bootstrap(rets, startValue, horizonDays, paths, seed) : [];
  const confidences = (input.confidences && input.confidences.length ? input.confidences : [0.95, 0.99])
    .slice().sort((a, b) => a - b);

  const riskStats = rets.length >= 20 ? {
    annRet: mean(rets) * TRADING_DAYS,
    annVol: stdev(rets) * Math.sqrt(TRADING_DAYS),
    sharpe: sharpeRatio(rets),
    maxDD: maxDrawdown(closes),
    obs: rets.length,
    varRows: confidences.map((c) => ({
      confidence: c, varPct: valueAtRisk(rets, c), cvarPct: expectedShortfall(rets, c),
    })),
  } : null;

  // Macro scenarios.
  const scenarioImpacts: ScenarioImpact[] = holdings.length && startValue > 0
    ? MACRO_SCENARIOS.map((s) =>
        applyMacroScenario(
          holdings.map((h) => ({ symbol: h.symbol, name: h.name, value: (h.weight ?? 0) * startValue })),
          s,
        ),
      )
    : [];

  const coMov = buildCoMovement(holdings);

  // ---------- Render ----------
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();

  header(doc, "Portfolio Investment Memo", asOf);

  // Cover block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42);
  doc.text(input.portfolioName ?? "Portfolio Overview", 14, 34);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.muted);
  doc.text(
    `${holdings.length} holding${holdings.length === 1 ? "" : "s"} · base currency ${currency}`,
    14,
    41,
  );

  // KPI cards
  const kpis: [string, string, [number, number, number]?][] = [
    ["Total value", fmtMoney(totalValue, currency)],
    ["Cost basis", fmtMoney(totalCost > 0 ? totalCost : undefined, currency)],
    [
      "Unrealised P/L",
      totalCost > 0 ? `${fmtMoney(unrealisedPnl, currency)} (${fmtPct(unrealisedPct, 1)})` : "—",
      totalCost > 0 ? (unrealisedPnl >= 0 ? BRAND.bull : BRAND.bear) : BRAND.muted,
    ],
    ["Diversification", diversificationVerdict(hhi.holdings).label, BRAND.accent],
  ];
  let y = 50;
  const cellW = (w - 28) / kpis.length;
  for (let i = 0; i < kpis.length; i++) {
    const x = 14 + i * cellW;
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(...BRAND.surface);
    doc.roundedRect(x, y, cellW - 2, 14, 1.5, 1.5, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(kpis[i][0].toUpperCase(), x + 3, y + 4.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const color = kpis[i][2] ?? [15, 23, 42];
    doc.setTextColor(...color);
    doc.text(kpis[i][1], x + 3, y + 11);
  }
  y += 20;

  // Executive summary
  y = sectionTitle(doc, "Executive Summary", y);
  if (input.analystNote) {
    y = paragraph(doc, input.analystNote, y, "italic");
    y += 1;
  }
  const summary: string[] = [];
  summary.push(
    `This portfolio of ${holdings.length} position${holdings.length === 1 ? "" : "s"} has a total market value of ` +
    `${fmtMoney(totalValue, currency)}${totalCost > 0 ? ` against a cost basis of ${fmtMoney(totalCost, currency)} (${fmtPct(unrealisedPct, 1)} unrealised)` : ""}.`,
  );
  if (byAssetClass.length) {
    summary.push(
      `Asset-class exposure is led by ${byAssetClass[0].label} (${fmtWeight(byAssetClass[0].weight)})` +
        (byAssetClass[1] ? `, followed by ${byAssetClass[1].label} (${fmtWeight(byAssetClass[1].weight)})` : "") +
        ".",
    );
  }
  if (bySector.length) {
    summary.push(
      `Top sectors: ${bySector.slice(0, 3).map((s) => `${s.label} (${fmtWeight(s.weight)})`).join(", ")}.`,
    );
  }
  if (riskStats) {
    summary.push(
      `Realised annualised volatility runs at ${fmtPct(riskStats.annVol, 1)} with a peak drawdown of ${fmtPct(riskStats.maxDD, 1)} ` +
      `and a Sharpe of ${riskStats.sharpe.toFixed(2)} over ${riskStats.obs} observations.`,
    );
  }
  if (finals.length) {
    const p5 = quantile(finals, 0.05);
    const p50 = quantile(finals, 0.50);
    const p95 = quantile(finals, 0.95);
    const probLoss = finals.filter((v) => v < startValue).length / finals.length;
    summary.push(
      `Monte Carlo (${paths.toLocaleString()} paths, ${horizonDays}-day horizon) projects a 5th/50th/95th percentile range of ` +
      `${fmtMoney(p5, currency)} – ${fmtMoney(p50, currency)} – ${fmtMoney(p95, currency)}, ` +
      `with a ${(probLoss * 100).toFixed(0)}% probability of finishing below today's value.`,
    );
  }
  if (scenarioImpacts.length) {
    const worst = scenarioImpacts.slice().sort((a, b) => a.pnlPct - b.pnlPct)[0];
    summary.push(
      `The worst-modelled macro scenario is "${worst.scenario.name}" (${fmtPct(worst.pnlPct, 2)} / ${fmtMoney(worst.pnl, currency)}).`,
    );
  }
  y = paragraph(doc, summary.join(" "), y);

  // Holdings table
  y = newPageIfNeeded(doc, y, 40);
  y = sectionTitle(doc, "Holdings", y);
  const holdingsRows = holdings
    .slice()
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .map((h) => {
      const meta = getInstrumentMeta(h.symbol);
      const cost = (h.shares != null && h.avgPrice != null) ? h.shares * h.avgPrice : null;
      const pnl = cost != null ? (h.value ?? 0) - cost : null;
      const pnlPct = cost && cost > 0 ? pnl! / cost : null;
      return [
        h.symbol,
        h.name ?? "",
        meta.assetClass,
        fmtWeight(h.weight ?? 0),
        fmtMoney(h.value, currency),
        cost != null ? fmtMoney(cost, currency) : "—",
        pnl != null ? fmtMoney(pnl, currency) : "—",
        pnlPct != null ? fmtPct(pnlPct, 1) : "—",
      ];
    });
  autoTable(doc, {
    startY: y,
    head: [["Symbol", "Name", "Class", "Weight", "Value", "Cost", "P/L", "P/L %"]],
    body: holdingsRows,
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: BRAND.primary, textColor: 255, fontSize: 8 },
    columnStyles: {
      0: { fontStyle: "bold" },
      3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" },
      6: { halign: "right" }, 7: { halign: "right" },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section !== "body" || (data.column.index !== 6 && data.column.index !== 7)) return;
      const txt = String(data.cell.text?.[0] ?? "");
      if (txt.startsWith("+")) data.cell.styles.textColor = BRAND.bull;
      else if (txt.startsWith("-") || txt.startsWith("−")) data.cell.styles.textColor = BRAND.bear;
    },
  });
  y = lastTableY(doc) + 6;

  // Allocation breakdowns
  y = newPageIfNeeded(doc, y, 60);
  y = sectionTitle(doc, "Allocation Breakdown", y);
  const renderAllocTable = (title: string, rows: { label: string; weight: number; value: number }[]) => {
    autoTable(doc, {
      startY: y,
      head: [[title, "Weight", "Value"]],
      body: rows.map((r) => [r.label, fmtWeight(r.weight), fmtMoney(r.value, currency)]),
      styles: { fontSize: 9, cellPadding: 1.8 },
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });
    y = lastTableY(doc) + 4;
  };
  renderAllocTable("By asset class", byAssetClass);
  y = newPageIfNeeded(doc, y, 50);
  renderAllocTable("By sector", bySector);
  y = newPageIfNeeded(doc, y, 50);
  renderAllocTable("By geography", byGeography);

  // Concentration table
  y = newPageIfNeeded(doc, y, 30);
  const hhiRows = [
    ["Position-level HHI", hhi.holdings.toFixed(3), diversificationVerdict(hhi.holdings).label],
    ["Asset-class HHI", hhi.assetClass.toFixed(3), diversificationVerdict(hhi.assetClass).label],
    ["Sector HHI", hhi.sector.toFixed(3), diversificationVerdict(hhi.sector).label],
    ["Geography HHI", hhi.geography.toFixed(3), diversificationVerdict(hhi.geography).label],
  ];
  autoTable(doc, {
    startY: y,
    head: [["Concentration", "HHI", "Verdict"]],
    body: hhiRows,
    styles: { fontSize: 9, cellPadding: 1.8 },
    headStyles: { fillColor: BRAND.primary, textColor: 255 },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index !== 2) return;
      const txt = String(data.cell.text?.[0] ?? "");
      if (txt.startsWith("Highly")) data.cell.styles.textColor = BRAND.bear;
      else if (txt.startsWith("Moderately")) data.cell.styles.textColor = BRAND.warn;
      else if (txt.startsWith("Well")) data.cell.styles.textColor = BRAND.bull;
    },
  });
  y = lastTableY(doc) + 6;

  // Risk metrics
  if (riskStats) {
    doc.addPage();
    y = 28;
    y = sectionTitle(doc, "Risk Metrics", y);
    autoTable(doc, {
      startY: y,
      body: [
        ["Observations", String(riskStats.obs)],
        ["Annualised return", fmtPct(riskStats.annRet, 2)],
        ["Annualised volatility", fmtPct(riskStats.annVol, 2)],
        ["Sharpe ratio (rf=0)", riskStats.sharpe.toFixed(2)],
        ["Maximum drawdown", fmtPct(riskStats.maxDD, 2)],
      ],
      styles: { fontSize: 10, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: "bold", textColor: BRAND.muted, cellWidth: 70 }, 1: { halign: "right" } },
      theme: "plain",
      margin: { left: 14, right: 14 },
    });
    y = lastTableY(doc) + 4;

    y = sectionTitle(doc, "Value at Risk / Conditional VaR (1-day, historical)", y);
    autoTable(doc, {
      startY: y,
      head: [["Confidence", "VaR %", `VaR (${currency})`, "CVaR %", `CVaR (${currency})`]],
      body: riskStats.varRows.map((r) => [
        `${(r.confidence * 100).toFixed(0)}%`,
        fmtPct(-r.varPct, 2),
        fmtMoney(-r.varPct * startValue, currency),
        fmtPct(-r.cvarPct, 2),
        fmtMoney(-r.cvarPct * startValue, currency),
      ]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });
    y = lastTableY(doc) + 6;
  }

  // Monte Carlo
  if (finals.length) {
    y = newPageIfNeeded(doc, y, 60);
    y = sectionTitle(doc, `Monte Carlo · ${horizonDays}-day horizon · ${paths.toLocaleString()} paths`, y);
    const percentiles = [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95];
    autoTable(doc, {
      startY: y,
      head: [["Percentile", "Terminal value", "Δ vs today"]],
      body: percentiles.map((p) => {
        const v = quantile(finals, p);
        const delta = startValue > 0 ? (v - startValue) / startValue : 0;
        return [`P${(p * 100).toFixed(0)}`, fmtMoney(v, currency), fmtPct(delta, 1)];
      }),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index !== 2) return;
        const txt = String(data.cell.text?.[0] ?? "");
        if (txt.startsWith("+")) data.cell.styles.textColor = BRAND.bull;
        else if (txt.startsWith("-")) data.cell.styles.textColor = BRAND.bear;
      },
    });
    y = lastTableY(doc) + 4;
    const probLoss = finals.filter((v) => v < startValue).length / finals.length;
    y = paragraph(
      doc,
      `Probability of finishing below today's value: ${(probLoss * 100).toFixed(1)}%. ` +
      `Method: non-parametric bootstrap of historical daily returns; resamples preserve realised fat tails and ` +
      `serial-independence assumptions but do not capture forward regime shifts.`,
      y,
      "italic",
    );
  }

  // Macro scenarios
  if (scenarioImpacts.length) {
    y = newPageIfNeeded(doc, y, 80);
    y = sectionTitle(doc, "Macro Scenario Stress", y);
    autoTable(doc, {
      startY: y,
      head: [["Scenario", "P/L %", `P/L (${currency})`, "Worst asset class", "Worst class P/L %"]],
      body: scenarioImpacts
        .slice()
        .sort((a, b) => a.pnlPct - b.pnlPct)
        .map((s) => {
          const worst = [...s.byBucket].sort((a, b) => a.pnl - b.pnl)[0];
          return [
            s.scenario.name,
            fmtPct(s.pnlPct, 2),
            fmtMoney(s.pnl, currency),
            worst?.bucket ?? "—",
            worst ? fmtPct(worst.pnlPct, 2) : "—",
          ];
        }),
      styles: { fontSize: 9, cellPadding: 1.8 },
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 4: { halign: "right" } },
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        if (data.section !== "body" || (data.column.index !== 1 && data.column.index !== 2 && data.column.index !== 4)) return;
        const txt = String(data.cell.text?.[0] ?? "");
        if (txt.startsWith("+")) data.cell.styles.textColor = BRAND.bull;
        else if (txt.startsWith("-") || txt.startsWith("−")) data.cell.styles.textColor = BRAND.bear;
      },
    });
    y = lastTableY(doc) + 6;
  }

  // Co-movement
  if (coMov.symbols.length > 1) {
    y = newPageIfNeeded(doc, y, 60);
    y = sectionTitle(doc, `Pairwise Co-Movement Proxy (avg ρ̂ ${coMov.avg.toFixed(2)})`, y);
    autoTable(doc, {
      startY: y,
      head: [["", ...coMov.symbols]],
      body: coMov.symbols.map((s, i) => [s, ...coMov.matrix[i].map((v) => v.toFixed(2))]),
      styles: { fontSize: 7, cellPadding: 1.2, halign: "center" },
      headStyles: { fillColor: BRAND.primary, textColor: 255, fontSize: 7 },
      columnStyles: { 0: { fontStyle: "bold", halign: "left", textColor: BRAND.muted } },
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index === 0) return;
        const v = Number(data.cell.text?.[0] ?? 0);
        if (!Number.isFinite(v)) return;
        const tint = (c: number) => Math.round(255 - (255 - c) * (0.15 + v * 0.6));
        data.cell.styles.fillColor = [tint(BRAND.bear[0]), tint(BRAND.bear[1]), tint(BRAND.bear[2])];
        if (v > 0.55) data.cell.styles.textColor = 255;
      },
    });
    y = lastTableY(doc) + 4;
    y = paragraph(
      doc,
      "Meta-derived similarity (asset class · sector · geography overlap). Use the Optimizer for full Pearson " +
      "correlation on return histories. Concentrated co-movement narrows Monte Carlo dispersion and amplifies macro tails.",
      y,
      "italic",
    );
  }

  // Per-instrument mini-thesis (only those with prose)
  const thesisHoldings = holdings.filter((h) => h.thesis && h.thesis.trim().length);
  if (thesisHoldings.length) {
    doc.addPage();
    y = 28;
    y = sectionTitle(doc, "Per-Instrument Notes", y);
    thesisHoldings.forEach((h) => {
      y = newPageIfNeeded(doc, y, 30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(`${h.symbol} — ${h.name ?? ""}`, 14, y);
      if (h.rating) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        const ratingColor = h.rating === "buy" || h.rating === "accumulate" ? BRAND.bull
          : h.rating === "sell" || h.rating === "reduce" ? BRAND.bear : BRAND.muted;
        doc.setTextColor(...ratingColor);
        doc.text(h.rating.toUpperCase(), w - 14, y, { align: "right" });
      }
      doc.setTextColor(0, 0, 0);
      y += 5;
      y = paragraph(doc, h.thesis!, y);
      y += 2;
    });
  }

  // Recommended actions
  y = newPageIfNeeded(doc, y, 40);
  y = sectionTitle(doc, "Recommended Actions", y);
  const actions: string[] = [];
  if (hhi.holdings > 0.30) {
    actions.push(
      "Position-level concentration is elevated — consider trimming the largest weights or adding diversifying instruments.",
    );
  }
  if (hhi.assetClass > 0.55) {
    actions.push(
      `Asset-class exposure is heavily skewed to ${byAssetClass[0].label}. Adding uncorrelated classes (bonds, commodities, alt) would lower tail risk.`,
    );
  }
  if (hhi.geography > 0.55) {
    actions.push(
      `Geographic concentration in ${byGeography[0].label} amplifies regional macro risk; consider broadening international exposure.`,
    );
  }
  if (riskStats && riskStats.maxDD < -0.25) {
    actions.push(
      `Historical drawdown of ${fmtPct(riskStats.maxDD, 1)} exceeds 25%; review stop-loss discipline and hedging overlays.`,
    );
  }
  if (scenarioImpacts.length) {
    const worst = scenarioImpacts.slice().sort((a, b) => a.pnlPct - b.pnlPct)[0];
    if (worst.pnlPct < -0.15) {
      actions.push(
        `Stress test "${worst.scenario.name}" implies a ${fmtPct(worst.pnlPct, 1)} drawdown; pre-define rebalancing triggers for the worst-affected bucket.`,
      );
    }
  }
  if (!actions.length) {
    actions.push("No structural issues detected at this level of analysis — continue scheduled rebalancing reviews.");
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  actions.forEach((a) => {
    const lines = doc.splitTextToSize(a, w - 32);
    y = newPageIfNeeded(doc, y, lines.length * 4.5 + 2);
    doc.setTextColor(...BRAND.accent);
    doc.text("▸", 16, y);
    doc.setTextColor(30, 30, 30);
    doc.text(lines, 22, y);
    y += lines.length * 4.5 + 1.5;
  });

  // Disclaimer
  y = newPageIfNeeded(doc, y, 28);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.muted);
  const disclaim =
    "This portfolio memo is generated automatically by Vela.ai for informational and educational purposes only. " +
    "It does not constitute investment advice, a recommendation, or an offer to buy or sell any security. Risk " +
    "metrics and Monte Carlo projections are model-based and rely on historical data, which is not predictive of " +
    "future returns. Always perform your own due diligence and consult a licensed financial advisor.";
  doc.text(doc.splitTextToSize(disclaim, w - 28), 14, y);

  footer(doc);

  const filename = buildPortfolioMemoFilename(input);
  doc.save(filename);
  return { filename };
}