import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  returns as toReturns,
  valueAtRisk,
  expectedShortfall,
  stdev,
  mean,
  maxDrawdown,
  sharpe as sharpeRatio,
  TRADING_DAYS,
} from "@/lib/riskMetrics";
import {
  MACRO_SCENARIOS,
  applyMacroScenario,
  quantile,
  type ScenarioImpact,
} from "@/lib/quantScenarios";
import { getInstrumentMeta, type AssetClass } from "@/lib/instrumentMeta";

/**
 * Portfolio-level investment memo built from a target allocation map.
 *
 * Distinct from `generatePortfolioInvestmentMemo` (which is geared to live
 * holdings + P/L). This entry point takes a *strategy* — weights, thesis,
 * goals, risk profile — and renders a single downloadable PDF covering:
 *   1. Executive summary (strategy thesis)
 *   2. Asset allocation breakdown (per-instrument + by asset class, w/ bar chart)
 *   3. Rationale for each instrument and asset class
 *   4. Consolidated risk assessment (quant if simulation enabled, else qualitative)
 *   5. Suitability mapping vs the stated risk profile and goals
 *   6. Macroeconomic context + scenario stress table
 *   7. Performance expectations (Monte Carlo bands if simulation enabled)
 *   8. Cross-asset co-movement / correlation matrix
 *   9. Catalysts and risks for the overall strategy
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

export type RiskProfile =
  | "conservative"
  | "moderate"
  | "balanced"
  | "growth"
  | "aggressive";

export interface PortfolioMemoSimulation {
  /** Historical equity-curve series for the strategy (synthetic or backtested). */
  equity?: { t: number; value: number }[];
  /** Override Monte Carlo defaults. */
  mcConfig?: { horizonDays?: number; paths?: number; seed?: number };
  /** Confidence levels for the VaR/CVaR rows. Defaults to [0.95, 0.99]. */
  confidences?: number[];
  /** Notional capital used to denominate Monte Carlo / VaR output. */
  notional?: number;
}

export interface GeneratePortfolioMemoOptions {
  allocation: Record<string, number>;
  strategyThesis: string;
  goals: string[];
  riskProfile: RiskProfile | string;
  /** Portfolio / strategy name displayed on the cover. */
  portfolioName?: string;
  /** Reporting currency. Defaults to "EUR". */
  currency?: string;
  /** Optional per-instrument analyst rationale (overrides auto-generated copy). */
  instrumentRationales?: Record<string, string>;
  /** Optional analyst-supplied macro outlook narrative. */
  macroOutlook?: string;
  /** Optional explicit catalysts / risks lists. Auto-derived when omitted. */
  catalysts?: string[];
  risks?: string[];
  /** Optional simulation block. When present unlocks VaR/CVaR + Monte Carlo. */
  simulation?: PortfolioMemoSimulation;
  /** When true (default) the PDF is downloaded; set false to receive the Blob only. */
  download?: boolean;
}

export interface GeneratePortfolioMemoResult {
  filename: string;
  blob: Blob;
}

// ---------- helpers ----------

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
  const out: number[] = [];
  for (let p = 0; p < paths; p++) {
    let v = start;
    for (let d = 0; d < horizon; d++) v *= 1 + rets[Math.floor(rand() * rets.length)];
    out.push(v);
  }
  return out;
}

function fmtPct(v: number | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
}
function fmtWeight(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
function fmtMoney(v: number | undefined, ccy: string): string {
  if (v == null || !Number.isFinite(v)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency", currency: ccy, maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `${ccy} ${v.toFixed(0)}`;
  }
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
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(
      `Vela.ai · Educational research only · Not financial advice · Page ${i} of ${n}`,
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
  const lines = doc.splitTextToSize(String(text ?? "").trim() || "—", w);
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

function bullets(doc: jsPDF, items: string[], y: number): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const w = doc.internal.pageSize.getWidth() - 32;
  for (const item of items) {
    const lines = doc.splitTextToSize(item, w);
    y = newPageIfNeeded(doc, y, lines.length * 4.5 + 2);
    doc.setTextColor(...BRAND.accent);
    doc.text("▸", 16, y);
    doc.setTextColor(30, 30, 30);
    doc.text(lines, 22, y);
    y += lines.length * 4.5 + 1.5;
  }
  return y;
}

function herfindahl(items: { weight: number }[]): number {
  return items.reduce((s, i) => s + i.weight * i.weight, 0);
}
function diversificationVerdict(hhi: number): "Highly concentrated" | "Moderately concentrated" | "Well diversified" {
  if (hhi > 0.55) return "Highly concentrated";
  if (hhi > 0.30) return "Moderately concentrated";
  return "Well diversified";
}

// Rough qualitative expected-return / vol bands per asset class — used when
// no historical equity series is supplied so the memo still has something
// quantitative to anchor expectations against.
const CLASS_BANDS: Record<AssetClass, { expRet: number; expVol: number; tone: string }> = {
  Equity:       { expRet: 0.08, expVol: 0.18, tone: "long-term growth driver, equity-beta risk" },
  ETF:          { expRet: 0.07, expVol: 0.15, tone: "diversified market exposure, broad beta" },
  Bond:         { expRet: 0.03, expVol: 0.06, tone: "income + ballast, duration/credit risk" },
  Commodity:    { expRet: 0.04, expVol: 0.20, tone: "inflation hedge, cyclical drawdowns" },
  Crypto:       { expRet: 0.15, expVol: 0.65, tone: "asymmetric upside, extreme volatility" },
  FX:           { expRet: 0.01, expVol: 0.10, tone: "carry / hedging tool, low standalone return" },
  REIT:         { expRet: 0.06, expVol: 0.20, tone: "yield + real-asset exposure, rate-sensitive" },
  Unclassified: { expRet: 0.05, expVol: 0.20, tone: "exposure not classified — review manually" },
};

function classRationale(cls: AssetClass, weight: number, sectorTop: string, geoTop: string): string {
  const band = CLASS_BANDS[cls];
  const w = fmtWeight(weight);
  switch (cls) {
    case "Equity":
      return `Equity sleeve at ${w} provides the strategy's primary growth engine, concentrated in ${sectorTop} (${geoTop}). Expected long-run return ≈ ${fmtPct(band.expRet, 0)} at ${fmtPct(band.expVol, 0)} vol; ${band.tone}.`;
    case "ETF":
      return `ETF allocation at ${w} delivers cost-efficient, rules-based exposure to ${sectorTop} in ${geoTop} — diversifies single-stock risk while keeping factor tilts intentional.`;
    case "Bond":
      return `Fixed-income weight of ${w} acts as ballast: lower expected return (≈ ${fmtPct(band.expRet, 0)}) but materially lower volatility (≈ ${fmtPct(band.expVol, 0)}) and counter-cyclical correlation in risk-off regimes.`;
    case "Commodity":
      return `Commodities at ${w} provide an inflation hedge and a different return driver than equities/bonds; expect ${fmtPct(band.expVol, 0)} annualised vol and cyclical drawdowns.`;
    case "Crypto":
      return `Crypto sleeve at ${w} is a high-conviction, high-volatility satellite (~${fmtPct(band.expVol, 0)} vol). Size assumes the investor can absorb 60%+ peak-to-trough drawdowns.`;
    case "REIT":
      return `REIT exposure at ${w} adds yield and real-asset diversification; sensitive to real rates and commercial-property cycles.`;
    case "FX":
      return `FX position at ${w} is a tactical hedging / carry instrument rather than a standalone return source.`;
    default:
      return `${cls} sleeve at ${w} — exposure not classified by the engine; manual review recommended.`;
  }
}

const RISK_PROFILE_TARGETS: Record<string, { equityFloor: number; equityCap: number; cryptoCap: number; bondFloor: number; label: string }> = {
  conservative: { equityFloor: 0.00, equityCap: 0.30, cryptoCap: 0.00, bondFloor: 0.50, label: "Conservative" },
  moderate:     { equityFloor: 0.20, equityCap: 0.55, cryptoCap: 0.02, bondFloor: 0.30, label: "Moderate" },
  balanced:     { equityFloor: 0.40, equityCap: 0.70, cryptoCap: 0.05, bondFloor: 0.20, label: "Balanced" },
  growth:       { equityFloor: 0.60, equityCap: 0.90, cryptoCap: 0.10, bondFloor: 0.05, label: "Growth" },
  aggressive:   { equityFloor: 0.70, equityCap: 1.00, cryptoCap: 0.20, bondFloor: 0.00, label: "Aggressive" },
};

function suitabilityMapping(
  riskProfile: string,
  byClass: { label: string; weight: number }[],
  goals: string[],
): { rows: string[][]; commentary: string } {
  const profile = RISK_PROFILE_TARGETS[riskProfile.toLowerCase()] ?? RISK_PROFILE_TARGETS.balanced;
  const wOf = (c: string) => byClass.find((x) => x.label === c)?.weight ?? 0;
  const equity = wOf("Equity") + wOf("ETF") + wOf("REIT");
  const bond = wOf("Bond");
  const crypto = wOf("Crypto");
  const judge = (val: number, lo: number, hi: number) =>
    val < lo ? "Below target" : val > hi ? "Above target" : "Within target";
  const rows: string[][] = [
    ["Equity-like (Equity + ETF + REIT)", fmtWeight(equity), `${fmtWeight(profile.equityFloor)} – ${fmtWeight(profile.equityCap)}`, judge(equity, profile.equityFloor, profile.equityCap)],
    ["Fixed income", fmtWeight(bond), `≥ ${fmtWeight(profile.bondFloor)}`, bond < profile.bondFloor ? "Below target" : "Within target"],
    ["Crypto satellite", fmtWeight(crypto), `≤ ${fmtWeight(profile.cryptoCap)}`, crypto > profile.cryptoCap ? "Above target" : "Within target"],
  ];
  const breaches = rows.filter((r) => r[3] !== "Within target");
  const commentary = breaches.length
    ? `For a ${profile.label.toLowerCase()} investor pursuing ${goals.length ? goals.join(", ") : "stated goals"}, ${breaches.length} sleeve(s) sit outside their guideline range — review before deployment.`
    : `Allocation is consistent with a ${profile.label.toLowerCase()} mandate targeting ${goals.length ? goals.join(", ") : "the stated goals"}; no sleeve breaches the guideline ranges.`;
  return { rows, commentary };
}

function deriveCatalysts(byClass: { label: string; weight: number }[]): string[] {
  const out: string[] = [];
  const wOf = (c: string) => byClass.find((x) => x.label === c)?.weight ?? 0;
  if (wOf("Equity") + wOf("ETF") > 0.3) out.push("Earnings season surprises and sustained margin expansion in core equity sleeve.");
  if (wOf("Bond") > 0.2) out.push("Central-bank pivot to a clearly easing cycle — repricing of duration boosts bond NAV.");
  if (wOf("Commodity") > 0.05) out.push("Supply tightness or inflation re-acceleration lifting commodity carry.");
  if (wOf("Crypto") > 0) out.push("Regulatory clarity (spot ETF flows, MiCA execution) re-rating digital-asset risk premium.");
  if (wOf("REIT") > 0.05) out.push("Real-rate compression supporting REIT valuations and refinancing pipelines.");
  if (!out.length) out.push("Broad risk-on regime with stable real rates and contained credit spreads.");
  return out;
}

function deriveRisks(byClass: { label: string; weight: number }[], hhi: number): string[] {
  const out: string[] = [];
  const wOf = (c: string) => byClass.find((x) => x.label === c)?.weight ?? 0;
  if (hhi > 0.30) out.push("Concentration risk — Herfindahl index above 0.30 indicates idiosyncratic single-name / class sensitivity.");
  if (wOf("Equity") + wOf("ETF") + wOf("REIT") > 0.7) out.push("Equity-beta dominance — a broad risk-off shock would drive a correlated drawdown across most of the book.");
  if (wOf("Bond") < 0.1) out.push("Limited fixed-income ballast — recession / deflation scenarios lack a counter-cyclical hedge.");
  if (wOf("Crypto") > 0.1) out.push("Outsized crypto allocation — 60%+ drawdowns historically observed; sizing should reflect loss tolerance.");
  out.push("Macro tail risk — geopolitical shocks, sovereign stress, or policy mistakes can compress multiples across all risk assets simultaneously.");
  return out;
}

// ---------- main entry point ----------

export function generatePortfolioMemo(opts: GeneratePortfolioMemoOptions): GeneratePortfolioMemoResult {
  const {
    allocation, strategyThesis, goals, riskProfile,
    portfolioName = "Portfolio Strategy",
    currency = "EUR",
    instrumentRationales = {},
    macroOutlook,
    catalysts,
    risks,
    simulation,
    download = true,
  } = opts;

  // Normalise allocation: skip non-positive weights, scale to sum=1.
  const raw = Object.entries(allocation ?? {})
    .map(([sym, w]) => ({ symbol: sym.trim().toUpperCase(), weight: Number(w) }))
    .filter((r) => r.symbol && Number.isFinite(r.weight) && r.weight > 0);
  const totalW = raw.reduce((s, r) => s + r.weight, 0) || 1;
  const positions = raw
    .map((r) => {
      const m = getInstrumentMeta(r.symbol);
      return { ...r, weight: r.weight / totalW, meta: m };
    })
    .sort((a, b) => b.weight - a.weight);

  if (!positions.length) {
    throw new Error("generatePortfolioMemo: allocation is empty after normalisation.");
  }

  // Aggregations.
  const groupBy = (key: (p: typeof positions[number]) => string) => {
    const m = new Map<string, number>();
    positions.forEach((p) => m.set(key(p), (m.get(key(p)) ?? 0) + p.weight));
    return [...m.entries()]
      .map(([label, weight]) => ({ label, weight }))
      .sort((a, b) => b.weight - a.weight);
  };
  const byAssetClass = groupBy((p) => p.meta.assetClass);
  const bySector = groupBy((p) => p.meta.sector);
  const byGeography = groupBy((p) => p.meta.geography);
  const hhi = {
    holdings: herfindahl(positions),
    assetClass: herfindahl(byAssetClass),
    sector: herfindahl(bySector),
    geography: herfindahl(byGeography),
  };

  // Optional simulation block.
  const sim = simulation;
  const closes = (sim?.equity ?? []).map((p) => p.value).filter((v) => Number.isFinite(v) && v > 0);
  const rets = closes.length > 1 ? toReturns(closes) : [];
  const horizonDays = sim?.mcConfig?.horizonDays ?? 252;
  const paths = sim?.mcConfig?.paths ?? 1500;
  const seed = sim?.mcConfig?.seed ?? 42;
  const notional = sim?.notional ?? (closes[closes.length - 1] ?? 100_000);
  const finals = rets.length >= 20 ? bootstrap(rets, notional, horizonDays, paths, seed) : [];
  const confidences = (sim?.confidences && sim.confidences.length ? sim.confidences : [0.95, 0.99])
    .slice().sort((a, b) => a - b);
  const riskStats = rets.length >= 20 ? {
    annRet: mean(rets) * TRADING_DAYS,
    annVol: stdev(rets) * Math.sqrt(TRADING_DAYS),
    sharpe: sharpeRatio(rets),
    maxDD: maxDrawdown(closes).maxDD,
    obs: rets.length,
    varRows: confidences.map((c) => ({
      confidence: c, varPct: valueAtRisk(rets, c), cvarPct: expectedShortfall(rets, c),
    })),
  } : null;

  // Scenario stress always available (uses weights + notional).
  const scenarioImpacts: ScenarioImpact[] = positions.length
    ? MACRO_SCENARIOS.map((s) => applyMacroScenario(
        positions.map((p) => ({ symbol: p.symbol, value: p.weight * notional })),
        s,
      ))
    : [];

  // Co-movement proxy (meta similarity).
  const coMov = (() => {
    const matrix = positions.map((a) => positions.map((b) => {
      if (a.symbol === b.symbol) return 1;
      let score = 0.05;
      if (a.meta.assetClass === b.meta.assetClass) score += 0.4;
      if (a.meta.sector === b.meta.sector) score += 0.35;
      if (a.meta.geography === b.meta.geography) score += 0.15;
      return Math.min(0.95, score);
    }));
    let sum = 0, n = 0;
    for (let i = 0; i < matrix.length; i++)
      for (let j = i + 1; j < matrix.length; j++) { sum += matrix[i][j]; n++; }
    return { matrix, symbols: positions.map((p) => p.symbol), avg: n ? sum / n : 0 };
  })();

  // ---------- render ----------
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const asOf = Date.now();
  header(doc, "Portfolio Strategy Memo", asOf);

  // Cover block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42);
  doc.text(portfolioName, 14, 34);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.muted);
  doc.text(
    `${positions.length} position${positions.length === 1 ? "" : "s"} · ${RISK_PROFILE_TARGETS[String(riskProfile).toLowerCase()]?.label ?? riskProfile} risk profile · base currency ${currency}`,
    14, 41,
  );

  // KPI cards
  const kpis: [string, string, [number, number, number]?][] = [
    ["Top asset class", `${byAssetClass[0].label} ${fmtWeight(byAssetClass[0].weight)}`, BRAND.accent],
    ["Top sector", `${bySector[0].label} ${fmtWeight(bySector[0].weight)}`],
    ["Geographies", String(byGeography.length)],
    ["Diversification", diversificationVerdict(hhi.holdings)],
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
    doc.setFontSize(10);
    doc.setTextColor(...(kpis[i][2] ?? [15, 23, 42]));
    doc.text(doc.splitTextToSize(kpis[i][1], cellW - 6)[0] ?? "", x + 3, y + 11);
  }
  y += 20;

  // 1. Executive Summary
  y = sectionTitle(doc, "1 · Executive Summary", y);
  y = paragraph(doc, strategyThesis || "No strategy thesis supplied.", y);
  if (goals.length) {
    y += 1;
    y = paragraph(doc, `Stated investor goals: ${goals.join("; ")}.`, y, "italic");
  }

  // 2. Asset Allocation breakdown
  y = newPageIfNeeded(doc, y, 60);
  y = sectionTitle(doc, "2 · Asset Allocation", y);

  // Bar chart (per-position weights).
  const chartTop = y;
  const chartH = Math.min(70, 6 + positions.length * 5.2);
  const barAreaW = w - 28 - 50; // leave 50mm for labels
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(...BRAND.surface);
  doc.roundedRect(14, chartTop, w - 28, chartH, 1.5, 1.5, "FD");
  positions.forEach((p, i) => {
    const rowY = chartTop + 5 + i * 5.2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(p.symbol, 17, rowY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND.muted);
    doc.text(fmtWeight(p.weight), 14 + 46, rowY, { align: "right" });
    const bw = Math.max(0.5, p.weight * barAreaW);
    doc.setFillColor(...BRAND.primary);
    doc.rect(14 + 48, rowY - 2.6, bw, 3.2, "F");
  });
  y = chartTop + chartH + 5;

  // Per-instrument allocation table
  y = newPageIfNeeded(doc, y, 30);
  autoTable(doc, {
    startY: y,
    head: [["Symbol", "Asset class", "Sector", "Geography", "Weight"]],
    body: positions.map((p) => [
      p.symbol, p.meta.assetClass, p.meta.sector, p.meta.geography, fmtWeight(p.weight),
    ]),
    styles: { fontSize: 9, cellPadding: 1.8 },
    headStyles: { fillColor: BRAND.primary, textColor: 255 },
    columnStyles: { 0: { fontStyle: "bold" }, 4: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });
  y = lastTableY(doc) + 4;

  // By-asset-class roll-up
  y = newPageIfNeeded(doc, y, 30);
  autoTable(doc, {
    startY: y,
    head: [["By asset class", "Weight"]],
    body: byAssetClass.map((b) => [b.label, fmtWeight(b.weight)]),
    styles: { fontSize: 9, cellPadding: 1.8 },
    headStyles: { fillColor: BRAND.primary, textColor: 255 },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });
  y = lastTableY(doc) + 6;

  // 3. Rationale
  doc.addPage();
  y = 28;
  y = sectionTitle(doc, "3 · Rationale for Inclusion & Weighting", y);

  // Per-asset-class rationale
  byAssetClass.forEach((bc) => {
    const cls = bc.label as AssetClass;
    const memberSectors = groupBy((p) => p.meta.assetClass === cls ? p.meta.sector : "__skip__")
      .filter((s) => s.label !== "__skip__");
    const memberGeos = groupBy((p) => p.meta.assetClass === cls ? p.meta.geography : "__skip__")
      .filter((s) => s.label !== "__skip__");
    y = newPageIfNeeded(doc, y, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.primary);
    doc.text(`${cls} — ${fmtWeight(bc.weight)}`, 14, y);
    y += 4.5;
    y = paragraph(doc, classRationale(
      cls, bc.weight,
      memberSectors[0]?.label ?? "—",
      memberGeos[0]?.label ?? "—",
    ), y);
  });

  // Per-instrument rationale
  y = newPageIfNeeded(doc, y, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Per-instrument notes", 14, y);
  y += 5;
  positions.forEach((p) => {
    const note = instrumentRationales[p.symbol]
      ?? `${p.symbol} (${p.meta.assetClass} · ${p.meta.sector} · ${p.meta.geography}) carries a ${fmtWeight(p.weight)} weight. ${CLASS_BANDS[p.meta.assetClass].tone[0].toUpperCase()}${CLASS_BANDS[p.meta.assetClass].tone.slice(1)}.`;
    y = newPageIfNeeded(doc, y, 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(`${p.symbol} · ${fmtWeight(p.weight)}`, 14, y);
    y += 4;
    y = paragraph(doc, note, y);
  });

  // 4. Risk assessment
  doc.addPage();
  y = 28;
  y = sectionTitle(doc, "4 · Consolidated Risk Assessment", y);
  if (riskStats) {
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
        fmtPct(-r.varPct, 2), fmtMoney(-r.varPct * notional, currency),
        fmtPct(-r.cvarPct, 2), fmtMoney(-r.cvarPct * notional, currency),
      ]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });
    y = lastTableY(doc) + 6;
  } else {
    // Qualitative weighted expected return / vol from CLASS_BANDS.
    const wRet = positions.reduce((s, p) => s + p.weight * CLASS_BANDS[p.meta.assetClass].expRet, 0);
    const wVol = positions.reduce((s, p) => s + p.weight * CLASS_BANDS[p.meta.assetClass].expVol, 0);
    y = paragraph(
      doc,
      `No historical equity series supplied — quantitative VaR/CVaR cannot be computed. ` +
      `Weighted by asset class, the strategy targets an expected long-run return ≈ ${fmtPct(wRet, 1)} ` +
      `at a (weighted, naïve) volatility ≈ ${fmtPct(wVol, 1)}, before any diversification benefit. ` +
      `Concentration: position-level HHI ${hhi.holdings.toFixed(3)} (${diversificationVerdict(hhi.holdings)}); ` +
      `asset-class HHI ${hhi.assetClass.toFixed(3)} (${diversificationVerdict(hhi.assetClass)}).`,
      y,
    );
  }

  // 5. Suitability mapping
  y = newPageIfNeeded(doc, y, 60);
  y = sectionTitle(doc, "5 · Suitability vs Risk Profile & Goals", y);
  const suit = suitabilityMapping(String(riskProfile), byAssetClass, goals);
  autoTable(doc, {
    startY: y,
    head: [["Sleeve", "Current", "Guideline", "Verdict"]],
    body: suit.rows,
    styles: { fontSize: 9, cellPadding: 1.8 },
    headStyles: { fillColor: BRAND.primary, textColor: 255 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index !== 3) return;
      const t = String(data.cell.text?.[0] ?? "");
      if (t === "Within target") data.cell.styles.textColor = BRAND.bull;
      else if (t === "Above target") data.cell.styles.textColor = BRAND.warn;
      else if (t === "Below target") data.cell.styles.textColor = BRAND.bear;
    },
  });
  y = lastTableY(doc) + 4;
  y = paragraph(doc, suit.commentary, y, "italic");

  // 6. Macro context
  doc.addPage();
  y = 28;
  y = sectionTitle(doc, "6 · Macroeconomic Context & Outlook", y);
  y = paragraph(doc,
    macroOutlook ??
    "Working assumption: a late-cycle macro regime with central banks tilting from peak-restrictive toward a gradual easing path, " +
    "inflation normalising but still above target, sovereign and credit spreads contained, and bouts of geopolitical risk-off " +
    "driving correlated cross-asset volatility. The portfolio is stress-tested below against canonical adverse scenarios.",
    y,
  );
  if (scenarioImpacts.length) {
    y = newPageIfNeeded(doc, y, 60);
    y = sectionTitle(doc, "Macro scenario stress", y);
    autoTable(doc, {
      startY: y,
      head: [["Scenario", "P/L %", `P/L (${currency})`, "Worst class", "Worst class P/L %"]],
      body: scenarioImpacts.slice().sort((a, b) => a.pnlPct - b.pnlPct).map((s) => {
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
        if (data.section !== "body" || ![1, 2, 4].includes(data.column.index)) return;
        const t = String(data.cell.text?.[0] ?? "");
        if (t.startsWith("+")) data.cell.styles.textColor = BRAND.bull;
        else if (t.startsWith("-") || t.startsWith("−")) data.cell.styles.textColor = BRAND.bear;
      },
    });
    y = lastTableY(doc) + 6;
  }

  // 7. Performance expectations
  y = newPageIfNeeded(doc, y, 60);
  y = sectionTitle(doc, "7 · Performance Expectations", y);
  if (finals.length) {
    const percentiles = [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95];
    autoTable(doc, {
      startY: y,
      head: [["Percentile", "Terminal value", "Δ vs notional"]],
      body: percentiles.map((p) => {
        const v = quantile(finals, p);
        const delta = notional > 0 ? (v - notional) / notional : 0;
        return [`P${(p * 100).toFixed(0)}`, fmtMoney(v, currency), fmtPct(delta, 1)];
      }),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index !== 2) return;
        const t = String(data.cell.text?.[0] ?? "");
        if (t.startsWith("+")) data.cell.styles.textColor = BRAND.bull;
        else if (t.startsWith("-")) data.cell.styles.textColor = BRAND.bear;
      },
    });
    y = lastTableY(doc) + 4;
    const probLoss = finals.filter((v) => v < notional).length / finals.length;
    y = paragraph(doc,
      `Monte Carlo: ${paths.toLocaleString()} paths, ${horizonDays}-day horizon, ` +
      `bootstrapped from ${rets.length} historical daily returns. Probability of ending below notional ` +
      `${fmtMoney(notional, currency)}: ${(probLoss * 100).toFixed(1)}%. Bootstrap preserves fat tails ` +
      `but assumes return distribution is stationary — forward regime shifts are not modelled.`, y, "italic");
  } else {
    const wRet = positions.reduce((s, p) => s + p.weight * CLASS_BANDS[p.meta.assetClass].expRet, 0);
    const wVol = positions.reduce((s, p) => s + p.weight * CLASS_BANDS[p.meta.assetClass].expVol, 0);
    y = paragraph(doc,
      `No simulation supplied. Qualitative expectation, weighted by asset-class long-run assumptions: ` +
      `annualised return ≈ ${fmtPct(wRet, 1)} at ≈ ${fmtPct(wVol, 1)} naïve volatility. Realised path will ` +
      `depend on entry timing, rebalancing discipline, and macro regime. Enable a simulation block to ` +
      `replace this section with bootstrapped Monte Carlo percentiles.`, y);
  }

  // 8. Cross-asset correlation matrix
  if (coMov.symbols.length > 1) {
    y = newPageIfNeeded(doc, y, 60);
    y = sectionTitle(doc, `8 · Cross-Asset Co-Movement (avg ρ̂ ${coMov.avg.toFixed(2)})`, y);
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
    y = paragraph(doc,
      "Meta-derived similarity (asset class · sector · geography overlap). Use as a structural proxy " +
      "for co-movement, not a substitute for a return-history Pearson correlation matrix.", y, "italic");
  }

  // 9. Catalysts & risks
  doc.addPage();
  y = 28;
  y = sectionTitle(doc, "9 · Key Catalysts & Risks", y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.bull);
  doc.text("Catalysts", 14, y);
  y += 4.5;
  y = bullets(doc, catalysts && catalysts.length ? catalysts : deriveCatalysts(byAssetClass), y);
  y += 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.bear);
  doc.text("Risks", 14, y);
  y += 4.5;
  y = bullets(doc, risks && risks.length ? risks : deriveRisks(byAssetClass, hhi.holdings), y);

  // Disclaimer
  y = newPageIfNeeded(doc, y, 28);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.muted);
  const disclaim =
    "This portfolio strategy memo is generated automatically by Vela.ai for informational and educational " +
    "purposes only. It does not constitute investment advice, a recommendation, or an offer to buy or sell " +
    "any security. Risk metrics, Monte Carlo projections, and macro scenarios are model-based and rely on " +
    "historical data and qualitative assumptions which are not predictive of future returns. Always perform " +
    "your own due diligence and consult a licensed financial advisor.";
  doc.text(doc.splitTextToSize(disclaim, w - 28), 14, y);

  footer(doc);

  const safe = portfolioName.replace(/[^a-zA-Z0-9_\-]/g, "_") || "portfolio";
  const filename = `vela-portfolio-memo-${safe}-${new Date(asOf).toISOString().slice(0, 10)}.pdf`;
  const blob = doc.output("blob");
  if (download) doc.save(filename);
  return { filename, blob };
}

export default generatePortfolioMemo;