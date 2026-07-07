import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import type { ImpactReport } from "./impact";
import type { RiskComparison } from "./impactRisk";

const BRAND = {
  primary: [13, 71, 161] as [number, number, number],
  accent: [20, 184, 166] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  bull: [22, 163, 74] as [number, number, number],
  bear: [220, 38, 38] as [number, number, number],
};

function header(doc: jsPDF, title: string, subtitle?: string) {
  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Vela.ai · Portfolio Impact Memo", 14, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(new Date().toLocaleString(), doc.internal.pageSize.getWidth() - 14, 14, { align: "right" });
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, 14, 34);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.muted);
    doc.text(subtitle, 14, 40);
    doc.setTextColor(0, 0, 0);
  }
}

function footer(doc: jsPDF) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(
      `Vela.ai · Portfolio Impact Memo · Page ${i} of ${n} · Educational only, not investment advice.`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" },
    );
  }
}

function fmtPct(n: number, d = 1) { return `${(n || 0).toFixed(d)}%`; }
function fmtMoney(n: number, ccy: string) {
  const s = Math.round(n).toLocaleString("en-US");
  return `${ccy} ${s}`;
}

function heatColor(pct: number, max: number): [number, number, number] {
  const ratio = Math.min(1, pct / Math.max(1, max));
  // pale blue → deep navy
  const r = Math.round(230 - ratio * (230 - BRAND.primary[0]));
  const g = Math.round(238 - ratio * (238 - BRAND.primary[1]));
  const b = Math.round(248 - ratio * (248 - BRAND.primary[2]));
  return [r, g, b];
}

export interface BuildImpactMemoOptions {
  title?: string;
  currency: string;
  impact: ImpactReport;
  risk?: RiskComparison | null;
  strategyThesis?: string;
}

/** Build the jsPDF document in-memory. Returns the doc + a suggested filename. */
export function buildImpactMemoPdf(opts: BuildImpactMemoOptions): { doc: jsPDF; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const title = opts.title ?? "Proposed strategy vs current portfolio";
  const subtitle = `Currency: ${opts.currency} · Current NAV ${fmtMoney(opts.impact.base.currentNav, opts.currency)} · Proposed capital ${fmtMoney(opts.impact.base.proposedCapital, opts.currency)}`;
  header(doc, title, subtitle);

  let y = 48;

  // ─── Executive summary ────────────────────────────────────────────
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Impact summary", 14, y); y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...BRAND.muted);
  const dv = opts.impact.diversification;
  const lines = [
    `Diversification score ${dv.currentScore} → ${dv.combinedScore} (Δ ${dv.delta >= 0 ? "+" : ""}${dv.delta}, ${dv.verdict}).`,
    opts.strategyThesis ? opts.strategyThesis : `The proposal adds ${opts.impact.combined.filter((r) => r.currentPct === 0 && r.proposedPct > 0).length} new positions and reinforces ${opts.impact.combined.filter((r) => r.duplicate).length} existing ones.`,
  ];
  const wrap = doc.splitTextToSize(lines.join(" "), 180);
  doc.setTextColor(0, 0, 0);
  doc.text(wrap, 14, y); y += wrap.length * 4 + 3;

  // ─── Combined weights table ──────────────────────────────────────
  const maxComb = Math.max(1, ...opts.impact.combined.map((r) => r.combinedPct));
  autoTable(doc, {
    startY: y,
    head: [["Symbol", "Sector", "Geo", "Current %", "Proposed %", "Combined %", "Action"]],
    body: opts.impact.combined.map((r) => [
      r.symbol,
      r.sector,
      r.geography,
      fmtPct(r.currentPct),
      fmtPct(r.proposedPct),
      fmtPct(r.combinedPct),
      r.action.toUpperCase() + (r.duplicate ? " · DUP" : ""),
    ]),
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: BRAND.primary, textColor: 255 },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 5) {
        const row = opts.impact.combined[data.row.index];
        data.cell.styles.fillColor = heatColor(row.combinedPct, maxComb);
      }
      if (data.section === "body" && data.column.index === 6) {
        const row = opts.impact.combined[data.row.index];
        if (row.duplicate) data.cell.styles.textColor = BRAND.bear;
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ─── Sector overlap heatmap ──────────────────────────────────────
  if (y > 220) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(0, 0, 0);
  doc.text("Sector overlap heatmap", 14, y); y += 3;
  const secMax = Math.max(1, ...opts.impact.sectorOverlap.map((s) => s.combinedPct));
  autoTable(doc, {
    startY: y + 2,
    head: [["Sector", "Current %", "Proposed %", "Combined %", "Δ", "Duplication"]],
    body: opts.impact.sectorOverlap.map((s) => [
      s.key,
      fmtPct(s.currentPct),
      fmtPct(s.proposedPct),
      fmtPct(s.combinedPct),
      `${s.deltaPct >= 0 ? "+" : ""}${s.deltaPct.toFixed(1)}%`,
      fmtPct(s.duplication),
    ]),
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: BRAND.primary, textColor: 255 },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const row = opts.impact.sectorOverlap[data.row.index];
      if (data.column.index === 3) data.cell.styles.fillColor = heatColor(row.combinedPct, secMax);
      if (data.column.index === 5 && row.duplication >= 15) {
        data.cell.styles.fillColor = [254, 226, 226];
        data.cell.styles.textColor = BRAND.bear;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ─── Geography overlap heatmap ───────────────────────────────────
  if (y > 230) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(0, 0, 0);
  doc.text("Geography overlap heatmap", 14, y);
  const geoMax = Math.max(1, ...opts.impact.geoOverlap.map((g) => g.combinedPct));
  autoTable(doc, {
    startY: y + 3,
    head: [["Geography", "Current %", "Proposed %", "Combined %", "Δ", "Duplication"]],
    body: opts.impact.geoOverlap.map((g) => [
      g.key,
      fmtPct(g.currentPct),
      fmtPct(g.proposedPct),
      fmtPct(g.combinedPct),
      `${g.deltaPct >= 0 ? "+" : ""}${g.deltaPct.toFixed(1)}%`,
      fmtPct(g.duplication),
    ]),
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: BRAND.primary, textColor: 255 },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const row = opts.impact.geoOverlap[data.row.index];
      if (data.column.index === 3) data.cell.styles.fillColor = heatColor(row.combinedPct, geoMax);
      if (data.column.index === 5 && row.duplication >= 15) {
        data.cell.styles.fillColor = [254, 226, 226];
        data.cell.styles.textColor = BRAND.bear;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ─── Risk comparison ─────────────────────────────────────────────
  if (opts.risk) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(0, 0, 0);
    doc.text(`Risk profile — before vs after (benchmark: ${opts.risk.benchmark})`, 14, y);
    const rows: (string | number)[][] = [];
    const cells = (r: RiskComparison["current"]) => r ? [
      fmtPct(r.vol * 100, 1),
      fmtPct(r.var95 * 100, 2),
      r.beta != null ? r.beta.toFixed(2) : "—",
    ] : ["—", "—", "—"];
    rows.push(["Current", ...cells(opts.risk.current)]);
    rows.push(["Proposed only", ...cells(opts.risk.proposed)]);
    rows.push(["Combined (after)", ...cells(opts.risk.combined)]);
    autoTable(doc, {
      startY: y + 3,
      head: [["Portfolio", "Annualised vol", "1-day 95% VaR", `Beta vs ${opts.risk.benchmark}`]],
      body: rows,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      didParseCell: (data) => {
        if (data.section === "body" && data.row.index === 2) data.cell.styles.fontStyle = "bold";
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ─── Diversification delta ───────────────────────────────────────
  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text("Diversification score", 14, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  const dtxt =
    `Current HHI ${dv.currentHhi} (score ${dv.currentScore}/100)  →  Combined HHI ${dv.combinedHhi} (score ${dv.combinedScore}/100).  ` +
    `Delta: ${dv.delta >= 0 ? "+" : ""}${dv.delta} points — ${dv.verdict}. ` +
    (dv.verdict === "improves"
      ? "The proposal spreads risk more evenly across positions."
      : dv.verdict === "worsens"
        ? "The proposal concentrates the portfolio further; consider trimming existing overlaps first."
        : "The proposal leaves overall concentration roughly unchanged.");
  const dwrap = doc.splitTextToSize(dtxt, 180);
  doc.text(dwrap, 14, y); y += dwrap.length * 4 + 4;

  // ─── Rebalance suggestions ───────────────────────────────────────
  if (opts.impact.rebalanceSuggestions.length) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text("Suggested rebalancing", 14, y);
    autoTable(doc, {
      startY: y + 3,
      head: [["Symbol / bucket", "Action", "From %", "To %", "Reason"]],
      body: opts.impact.rebalanceSuggestions.map((s) => [
        s.symbol, s.action.toUpperCase(), fmtPct(s.fromPct), fmtPct(s.toPct), s.reason,
      ]),
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 1.5, valign: "top" },
      headStyles: { fillColor: BRAND.primary, textColor: 255 },
      columnStyles: { 4: { cellWidth: 90 } },
    });
  }

  footer(doc);

  const filename = `portfolio-impact-${new Date().toISOString().slice(0, 10)}.pdf`;
  return { doc, filename };
}

/**
 * Builds the PDF, triggers a browser download, and persists a copy in the
 * user's memo history (memos storage bucket + generated_memos row).
 */
export async function saveAndDownloadImpactMemo(opts: BuildImpactMemoOptions & { userId?: string }): Promise<{ storagePath?: string; memoId?: string; }> {
  const { doc, filename } = buildImpactMemoPdf(opts);

  // Trigger local download
  try { doc.save(filename); } catch { /* noop */ }

  if (!opts.userId) return {};

  try {
    const blob = doc.output("blob");
    const bytes = (blob as Blob).size;
    const storagePath = `${opts.userId}/impact/${Date.now()}-${filename}`;
    const upload = await supabase.storage.from("memos").upload(storagePath, blob, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upload.error) throw upload.error;
    const tickers = opts.impact.combined.map((r) => r.symbol);
    const { data: row, error: insertErr } = await supabase.from("generated_memos").insert({
      user_id: opts.userId,
      title: opts.title ?? "Portfolio Impact Memo",
      base_currency: opts.currency,
      storage_path: storagePath,
      pdf_bytes: bytes,
      tickers,
      fingerprints: { kind: "portfolio_impact" },
      input_snapshot: JSON.parse(JSON.stringify({
        currency: opts.currency,
        currentNav: opts.impact.base.currentNav,
        proposedCapital: opts.impact.base.proposedCapital,
        diversification: opts.impact.diversification,
        combined: opts.impact.combined,
        sectorOverlap: opts.impact.sectorOverlap,
        geoOverlap: opts.impact.geoOverlap,
        risk: opts.risk ?? null,
      })),
    }).select("id").single();
    if (insertErr) throw insertErr;
    return { storagePath, memoId: row?.id };
  } catch (err) {
    console.error("[impact memo] persist failed", err);
    return {};
  }
}