/**
 * HTML/CSS template for the Vela investment memo PDF.
 * All styling resolves through `tokens` — no literal hex / sizes in component HTML.
 * The template emits one self-contained HTML document suitable for Chromium print.
 */
import { tokens } from "./tokens";
import { esc, int, money, pct, pctPlain, sentenceCase } from "./format";
import { sanitizeProse } from "./sanitizeProse";
import type { MemoInput, Holding, Instrument, Correlation } from "./schema";
import { pickInstrumentMetric } from "./fallbacks";

/** Render the full HTML doc for a memo. Input must already be fallback-cleaned. */
export function renderMemoHtml(input: MemoInput): string {
  const body = input.memo_type === "portfolio" ? portfolioBody(input) : strategyBody(input);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(input.meta.title)}</title>
<style>${stylesheet()}</style>
</head>
<body>
${cover(input)}
<main class="doc">
${body}
${methodologyAndDisclosures(input)}
</main>
${runningChrome(input)}
</body>
</html>`;
}

/* ============================== stylesheet ============================== */

function stylesheet(): string {
  const c = tokens.color;
  const s = tokens.size;
  const sp = tokens.space;
  const p = tokens.page;
  const t = tokens.table;
  return `
@page { size: ${p.size}; margin: ${p.marginTop}mm ${p.marginRight}mm ${p.marginBottom}mm ${p.marginLeft}mm; }
@page :first { margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; color: ${c.ink}; font-family: ${tokens.font.sans}; font-size: ${s.body}pt; line-height: ${tokens.leading.body}pt; }
.doc { padding: 0; }
h1.section { font-size: ${s.h1}pt; font-weight: 700; color: ${c.navy}; margin: ${sp.section}pt 0 ${sp.md}pt; letter-spacing: 0; }
h2.sub { font-size: ${s.sec}pt; font-weight: 700; color: ${c.navy}; margin: ${sp.lg}pt 0 ${sp.sm}pt; }
p { margin: 0 0 ${sp.sm}pt; }
.kicker { font-family: ${tokens.font.mono}; font-size: ${s.label}pt; letter-spacing: ${tokens.tracking.label}pt; text-transform: uppercase; color: ${c.ocean}; }

/* ---------- cover ---------- */
.cover { width: 210mm; height: 297mm; background: ${c.navy}; color: ${c.coverTitle}; padding: 24mm 20mm; display: flex; flex-direction: column; page-break-after: always; position: relative; }
.cover .logo { display: flex; align-items: center; gap: 8pt; }
.cover .wordmark { font-size: 14pt; font-weight: 700; letter-spacing: 0.4pt; color: ${c.coverTitle}; }
.cover .kicker-cover { color: ${c.coverKicker}; font-family: ${tokens.font.mono}; font-size: ${s.label}pt; letter-spacing: ${tokens.tracking.label}pt; text-transform: uppercase; margin-top: 28mm; }
.cover h1 { font-size: ${s.coverTitle}pt; line-height: 1.1; margin: ${sp.md}pt 0 ${sp.sm}pt; color: ${c.coverTitle}; font-weight: 700; }
.cover .sub { font-size: ${s.coverSub}pt; color: ${c.coverSub}; max-width: 140mm; }
.cover .spacer { flex: 1; }
.cover .marquee { background: ${c.navyDeep}; border-radius: ${tokens.radius.sm}pt; padding: 14pt 16pt; display: grid; gap: 16pt; }
.cover .marquee .cell .label { font-family: ${tokens.font.mono}; font-size: ${s.label}pt; letter-spacing: ${tokens.tracking.label}pt; text-transform: uppercase; color: ${c.coverSub}; }
.cover .marquee .cell .value { font-size: ${Math.round(s.coverTitle * 0.5)}pt; font-weight: 700; color: ${c.coverTitle}; margin-top: 4pt; }
.cover .marquee .cell .value.positive { color: ${c.positive}; }
.cover .marquee .cell .value.negative { color: ${c.negative}; }
.cover .marquee .cell .value.amber { color: ${c.amber}; }
.cover .foot { color: ${c.coverFoot}; font-size: ${s.small}pt; margin-top: 12pt; }

/* ---------- recommendation / mandate strip ---------- */
.strip { display: grid; gap: 0; border: ${tokens.rule.hairline}pt solid ${c.line}; border-radius: ${tokens.radius.sm}pt; background: ${c.panel}; }
.strip .cell { padding: ${sp.md}pt ${sp.lg}pt; border-right: ${tokens.rule.hairline}pt solid ${c.line}; }
.strip .cell:last-child { border-right: none; }
.strip .cell .label { font-family: ${tokens.font.mono}; font-size: ${s.label}pt; letter-spacing: ${tokens.tracking.label}pt; text-transform: uppercase; color: ${c.steel}; }
.strip .cell .value { font-size: ${s.sec}pt; font-weight: 700; color: ${c.navy}; margin-top: 3pt; }

/* ---------- data table ---------- */
table.data { width: 100%; border-collapse: collapse; border: ${tokens.rule.hairline}pt solid ${t.outerBox}; font-size: ${s.td}pt; }
table.data thead th { background: ${t.headerFill}; color: ${t.headerText}; text-align: left; font-size: ${s.th}pt; font-weight: 700; padding: ${t.cellPadY}pt ${t.cellPadX}pt; }
table.data thead th.num { text-align: right; }
table.data tbody td { padding: ${t.cellPadY}pt ${t.cellPadX}pt; border-top: ${tokens.rule.hairline}pt solid ${t.rowSep}; vertical-align: middle; }
table.data tbody tr:nth-child(even) td { background: ${t.rowAltFill}; }
table.data td.num { text-align: right; font-variant-numeric: tabular-nums; font-family: ${tokens.font.mono}; }
table.data td.pos { color: ${c.positive}; }
table.data td.neg { color: ${c.negative}; }

/* ---------- severity bar ---------- */
.bar { position: relative; height: 7pt; background: ${c.line2}; border-radius: 1pt; overflow: hidden; min-width: 60pt; }
.bar > span { display: block; height: 100%; background: ${c.negative}; }
.bar.amber > span { background: ${c.amber}; }

/* ---------- correlation matrix ---------- */
table.corr { width: 100%; border-collapse: collapse; font-size: ${s.td}pt; }
table.corr th, table.corr td { padding: ${t.cellPadY}pt ${t.cellPadX}pt; text-align: center; font-family: ${tokens.font.mono}; }
table.corr thead th { background: ${t.headerFill}; color: ${t.headerText}; font-size: ${s.th}pt; }
table.corr tbody th { background: ${t.headerFill}; color: ${t.headerText}; font-size: ${s.th}pt; text-align: left; }

/* ---------- per-instrument block ---------- */
.instr { break-inside: avoid; padding: ${sp.lg}pt 0; border-top: ${tokens.rule.accent}pt solid ${c.ocean}; margin-top: ${sp.lg}pt; }
.instr .head { display: flex; align-items: baseline; justify-content: space-between; gap: ${sp.md}pt; }
.instr .ticker { font-family: ${tokens.font.mono}; font-size: ${s.tickerLg}pt; font-weight: 700; color: ${c.navy}; }
.instr .name { font-size: ${s.body}pt; color: ${c.steel}; flex: 1; }
.instr .alloc { font-family: ${tokens.font.mono}; font-size: ${s.sec}pt; font-weight: 700; color: ${c.navy}; }
.instr .metric { font-family: ${tokens.font.mono}; font-size: ${s.small}pt; color: ${c.muted}; margin-top: 2pt; }
.instr h3 { font-size: ${s.sub}pt; font-weight: 700; color: ${c.ocean}; margin: ${sp.md}pt 0 ${sp.xs}pt; }

/* ---------- disclosure box ---------- */
.disclosure { background: ${c.panel}; border-left: ${tokens.rule.disclosureLeft}pt solid ${c.gold}; border-radius: 0; padding: ${sp.md}pt ${sp.lg}pt; font-size: ${s.small}pt; line-height: ${tokens.leading.small}pt; color: ${c.muted}; text-align: justify; }

/* ---------- running header/footer (paged-media) ---------- */
.running-header, .running-footer { position: fixed; left: 0; right: 0; padding: 0 ${p.marginLeft}mm; color: ${c.steel}; font-size: ${s.small}pt; }
.running-header { top: ${p.headerY}mm; display: flex; justify-content: space-between; align-items: center; border-bottom: ${tokens.rule.hairline}pt solid ${c.line}; padding-bottom: 4pt; }
.running-footer { bottom: ${p.footerY}mm; display: flex; justify-content: space-between; align-items: center; border-top: ${tokens.rule.hairline}pt solid ${c.line}; padding-top: 4pt; }
.running-header .right, .running-footer .right { color: ${c.muted}; }

/* keep-together helper */
.keep { break-inside: avoid; }
.page-break { break-after: page; }
`;
}

/* ============================== cover ============================== */

function cover(input: MemoInput): string {
  const meta = input.meta;
  const cov = input.cover ?? {};
  const stats = cov.stats ?? [];
  const gridCols = Math.max(1, Math.min(4, stats.length));
  const cells = stats
    .map((s) => {
      const cls = s.sign ? ` ${s.sign}` : "";
      return `<div class="cell"><div class="label">${esc(s.label)}</div><div class="value${cls}">${esc(s.value)}</div></div>`;
    })
    .join("");
  const marquee = stats.length
    ? `<div class="marquee" style="grid-template-columns: repeat(${gridCols}, 1fr);">${cells}</div>`
    : "";
  const kicker = cov.kicker ? `<div class="kicker-cover">${esc(cov.kicker)}</div>` : "";
  return `
<section class="cover">
  <div class="logo">${sailMark()}<span class="wordmark">Vela</span></div>
  ${kicker}
  <h1>${esc(meta.title)}</h1>
  ${meta.subtitle ? `<div class="sub">${esc(meta.subtitle)}</div>` : ""}
  <div class="spacer"></div>
  ${marquee}
  <div class="foot">${meta.confidential === false ? "" : "Private &amp; Confidential. "}${meta.generated_at ? esc(formatDate(meta.generated_at)) : ""}</div>
</section>`;
}

function sailMark(): string {
  // simple inline SVG using logo tokens (no external assets in print)
  return `<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
    <polygon points="2,18 11,2 11,18" fill="${tokens.logo.mainSail}"/>
    <polygon points="11,18 11,6 19,18" fill="${tokens.logo.accentSail}"/>
    <rect x="2" y="18" width="18" height="2" fill="${tokens.logo.hull}"/>
  </svg>`;
}

/* ============================== running chrome ============================== */

function runningChrome(input: MemoInput): string {
  const title = sanitizeProse(input.meta.title);
  const date = input.meta.generated_at ? formatDate(input.meta.generated_at) : "";
  return `
<div class="running-header"><span><strong>Vela</strong> · ${esc(title)}</span><span class="right">Private &amp; Confidential</span></div>
<div class="running-footer"><span>This document is for informational purposes only and is not investment advice.</span><span>${esc(date)}</span><span class="right"></span></div>`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/* ============================== portfolio body ============================== */

function portfolioBody(input: MemoInput): string {
  return [
    investmentCommitteeSummary(input),
    holdingsAndAttribution(input),
    riskSection(input),
    constructionSection(input),
  ]
    .filter(Boolean)
    .join("\n");
}

function investmentCommitteeSummary(input: MemoInput): string {
  const s = input.summary;
  if (!s) return "";
  const stripCells = [
    s.stance && { label: "Stance", value: s.stance },
    s.conviction && { label: "Conviction", value: s.conviction },
    s.risk_budget && { label: "Risk budget", value: s.risk_budget },
    s.horizon && { label: "Horizon", value: s.horizon },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const strip = stripCells.length
    ? `<div class="strip" style="grid-template-columns: repeat(${stripCells.length}, 1fr);">${stripCells
        .map((c) => `<div class="cell"><div class="label">${esc(c.label)}</div><div class="value">${esc(c.value)}</div></div>`)
        .join("")}</div>`
    : "";

  const paras = (s.assessment_paragraphs ?? [])
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");

  const km = s.key_metrics?.length
    ? `<table class="data"><thead><tr><th>Metric</th><th class="num">Value</th></tr></thead><tbody>${s.key_metrics
        .map(
          (m) =>
            `<tr><td>${esc(m.label)}</td><td class="num ${m.sign === "positive" ? "pos" : m.sign === "negative" ? "neg" : ""}">${esc(m.value)}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : "";

  const actions = s.actions?.length
    ? `<h2 class="sub">Prioritized actions</h2><table class="data"><thead><tr><th>#</th><th>Action</th><th>Rationale</th><th>Impact</th><th>Priority</th></tr></thead><tbody>${s.actions
        .map(
          (a, i) =>
            `<tr><td class="num">${a.n ?? i + 1}</td><td>${esc(a.action)}</td><td>${esc(a.rationale ?? "")}</td><td>${esc(a.impact ?? "")}</td><td>${esc(a.priority ?? "")}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : "";

  if (!strip && !paras && !km && !actions) return "";

  return `<section><h1 class="section">Investment committee summary</h1>${strip}${paras}${km}${actions}</section>`;
}

function holdingsAndAttribution(input: MemoInput): string {
  const holdings = input.holdings ?? [];
  const geo = input.geography_lookthrough ?? [];
  const sectors = input.sectors_gics ?? [];
  if (!holdings.length && !geo.length && !sectors.length) return "";

  const ccy = input.meta.base_currency ?? "EUR";

  const hRows = holdings
    .map((h: Holding) => {
      const pl = h.pl ?? null;
      const plCls = pl == null ? "" : pl >= 0 ? "pos" : "neg";
      const plPctCls = h.pl_pct == null ? "" : h.pl_pct >= 0 ? "pos" : "neg";
      const contribCls = h.contribution == null ? "" : h.contribution >= 0 ? "pos" : "neg";
      return `<tr>
        <td><strong>${esc(h.symbol)}</strong>${h.name ? ` · ${esc(h.name)}` : ""}</td>
        <td class="num">${pctPlain(h.weight) ?? ""}</td>
        <td class="num">${money(h.value ?? null, ccy) ?? ""}</td>
        <td class="num">${money(h.cost ?? null, ccy) ?? ""}</td>
        <td class="num ${plCls}">${money(pl, ccy) ?? ""}</td>
        <td class="num ${plPctCls}">${pct(h.pl_pct ?? null) ?? ""}</td>
        <td class="num ${contribCls}">${pct(h.contribution ?? null) ?? ""}</td>
      </tr>`;
    })
    .join("");

  const hTable = hRows
    ? `<table class="data"><thead><tr>
        <th>Holding</th><th class="num">Weight</th><th class="num">Value</th><th class="num">Cost</th>
        <th class="num">P/L</th><th class="num">P/L %</th><th class="num">Contribution</th>
      </tr></thead><tbody>${hRows}</tbody></table>`
    : "";

  const geoTable = geo.length
    ? `<h2 class="sub">Look-through geographic exposure</h2><table class="data"><thead><tr><th>Region</th><th class="num">Weight</th></tr></thead><tbody>${geo
        .map((g) => `<tr><td>${esc(g.region)}</td><td class="num">${pctPlain(g.weight) ?? ""}</td></tr>`)
        .join("")}</tbody></table>`
    : "";

  const sectorCovered = sectors.reduce((acc, s) => acc + (s.weight || 0), 0);
  const sectorTable = sectors.length && sectorCovered >= 30
    ? `<h2 class="sub">GICS sector exposure</h2><table class="data"><thead><tr><th>Sector</th><th class="num">Weight</th></tr></thead><tbody>${sectors
        .map((s) => `<tr><td>${esc(s.sector)}</td><td class="num">${pctPlain(s.weight) ?? ""}</td></tr>`)
        .join("")}</tbody><tfoot><tr><td colspan="2" style="color:${tokens.color.muted};font-size:${tokens.size.small}pt;">Covered: ${pctPlain(sectorCovered) ?? ""} of NAV.</td></tr></tfoot></table>`
    : sectors.length
      ? `<p style="color:${tokens.color.muted};font-size:${tokens.size.small}pt;">Sector breakdown unavailable for the majority of holdings, chart omitted.</p>`
      : "";

  return `<section><h1 class="section">Holdings and attribution</h1>${hTable}${geoTable}${sectorTable}</section>`;
}

function riskSection(input: MemoInput): string {
  const div = input.diversification;
  const stress = input.macro_stress ?? [];
  if (!div && !stress.length) return "";

  const divBlock = div
    ? `<p><strong>${esc(sentenceCase(div.verdict))}.</strong></p><table class="data"><thead><tr><th>Lens</th><th class="num">HHI</th><th class="num">Effective N</th><th>Reading</th></tr></thead><tbody>${div.axes
        .map(
          (a) =>
            `<tr><td>${esc(a.lens)}</td><td class="num">${a.hhi.toFixed(2)}</td><td class="num">${a.effective_n != null ? a.effective_n.toFixed(1) : ""}</td><td>${esc(a.reading ?? "")}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : "";

  const maxAbs = Math.max(1, ...stress.map((s) => Math.abs(s.pl_pct)));
  const stressBlock = stress.length
    ? `<h2 class="sub">Macro stress scenarios</h2><table class="data"><thead><tr><th>Scenario</th><th class="num">P/L %</th><th class="num">P/L</th><th>Severity</th></tr></thead><tbody>${stress
        .map((s) => {
          const w = Math.round((Math.abs(s.pl_pct) / maxAbs) * 100);
          const cls = Math.abs(s.pl_pct) > maxAbs * 0.66 ? "" : "amber";
          return `<tr>
            <td>${esc(s.scenario)}</td>
            <td class="num ${s.pl_pct >= 0 ? "pos" : "neg"}">${pct(s.pl_pct) ?? ""}</td>
            <td class="num">${money(s.pl_eur ?? null, input.meta.base_currency ?? "EUR") ?? ""}</td>
            <td><div class="bar ${cls}"><span style="width:${w}%"></span></div></td>
          </tr>`;
        })
        .join("")}</tbody></table>`
    : "";

  return `<section><h1 class="section">Risk</h1>${divBlock}${stressBlock}</section>`;
}

function constructionSection(input: MemoInput): string {
  const corr = input.correlation;
  const impl = input.implementation ?? [];
  const triggers = input.rebalance_triggers ?? [];
  if (!corr && !impl.length && !triggers.length) return "";

  const corrBlock = corr ? correlationMatrix(corr) : "";

  const implBlock = impl.length
    ? `<h2 class="sub">Implementation: target vs current</h2><table class="data"><thead><tr><th>Sleeve</th><th class="num">Current</th><th class="num">Target</th><th class="num">Change</th><th>Instrument</th></tr></thead><tbody>${impl
        .map(
          (r) =>
            `<tr><td>${esc(r.sleeve)}</td><td class="num">${pctPlain(r.current) ?? ""}</td><td class="num">${pctPlain(r.target) ?? ""}</td><td class="num ${r.change >= 0 ? "pos" : "neg"}">${pct(r.change) ?? ""}</td><td>${esc(r.instrument ?? "")}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : "";

  const trigBlock = triggers.length
    ? `<h2 class="sub">Rebalance triggers</h2><ul>${triggers.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
    : "";

  return `<section><h1 class="section">Construction</h1>${corrBlock}${implBlock}${trigBlock}</section>`;
}

function correlationMatrix(c: Correlation): string {
  const ramp = tokens.color.corr;
  const cell = (v: number) => {
    const idx = Math.min(ramp.length - 1, Math.max(0, Math.floor(Math.abs(v) * ramp.length)));
    return `<td style="background:${ramp[idx]};">${v.toFixed(2)}</td>`;
  };
  return `<h2 class="sub">Return-based correlation (${esc(c.method)})</h2>
<table class="corr"><thead><tr><th></th>${c.labels.map((l) => `<th>${esc(l)}</th>`).join("")}</tr></thead>
<tbody>${c.matrix
    .map((row, i) => `<tr><th>${esc(c.labels[i])}</th>${row.map(cell).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

/* ============================== strategy body ============================== */

function strategyBody(input: MemoInput): string {
  return [strategySummary(input), instrumentDeepDives(input), implementationSteps(input)]
    .filter(Boolean)
    .join("\n");
}

function strategySummary(input: MemoInput): string {
  const s = input.summary;
  if (!s) return "";
  const stripCells = [
    s.mandate && { label: "Mandate", value: s.mandate },
    s.stance && { label: "Stance", value: s.stance },
    s.conviction && { label: "Conviction", value: s.conviction },
    s.horizon && { label: "Horizon", value: s.horizon },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const strip = stripCells.length
    ? `<div class="strip" style="grid-template-columns: repeat(${stripCells.length}, 1fr);">${stripCells
        .map((c) => `<div class="cell"><div class="label">${esc(c.label)}</div><div class="value">${esc(c.value)}</div></div>`)
        .join("")}</div>`
    : "";

  const paras = (s.philosophy_paragraphs ?? s.assessment_paragraphs ?? [])
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");

  const alloc = s.allocation_summary?.length
    ? `<h2 class="sub">Allocation</h2><table class="data"><thead><tr><th>Sleeve</th><th class="num">Weight</th><th>Instruments</th></tr></thead><tbody>${s.allocation_summary
        .map((a) => `<tr><td>${esc(a.sleeve)}</td><td class="num">${pctPlain(a.weight) ?? ""}</td><td>${esc(a.instruments ?? "")}</td></tr>`)
        .join("")}</tbody></table>`
    : "";

  const deploy = s.capital_deployment?.length
    ? `<h2 class="sub">Capital deployment</h2><table class="data"><tbody>${s.capital_deployment
        .map((d) => `<tr><td>${esc(d.label)}</td><td><div class="bar"><span style="width:${Math.min(100, Math.max(0, d.weight))}%"></span></div></td><td class="num">${pctPlain(d.weight) ?? ""}</td></tr>`)
        .join("")}</tbody></table>`
    : "";

  if (!strip && !paras && !alloc && !deploy) return "";
  return `<section><h1 class="section">Strategy summary</h1>${strip}${paras}${alloc}${deploy}</section>`;
}

function instrumentDeepDives(input: MemoInput): string {
  const list = input.instruments ?? [];
  if (!list.length) return "";
  return list
    .map((i, idx) => {
      const block = instrumentBlock(i);
      const brk = (idx + 1) % 3 === 0 && idx + 1 < list.length ? `<div class="page-break"></div>` : "";
      return block + brk;
    })
    .join("");
}

function instrumentBlock(i: Instrument): string {
  const metric = pickInstrumentMetric(i);
  const metricLine = metric ? `<div class="metric">${esc(metric.label)}: ${esc(metric.value)}</div>` : "";
  const tag = i.tag ? `<span class="kicker">${esc(i.tag)}</span> ` : "";

  const sections: string[] = [];
  if (i.overview) sections.push(`<h3>Overview</h3><p>${esc(i.overview)}</p>`);
  if (i.rationale) sections.push(`<h3>Investment rationale</h3><p>${esc(i.rationale)}</p>`);
  if (i.suitability) sections.push(`<h3>Suitability fit</h3><p>${esc(i.suitability)}</p>`);

  const rw = i.roic_wacc;
  if (rw && (rw.roic != null || rw.wacc != null || rw.spread != null)) {
    const pctOrDash = (v: number | null | undefined) =>
      v == null || !Number.isFinite(v) ? "-" : `${(v * 100).toFixed(1)}%`;
    const rows: string[] = [];
    rows.push(`<tr><td>ROIC</td><td class="num">${pctOrDash(rw.roic ?? null)}</td></tr>`);
    rows.push(`<tr><td>WACC</td><td class="num">${pctOrDash(rw.wacc ?? null)}</td></tr>`);
    rows.push(`<tr><td><strong>ROIC − WACC spread</strong></td><td class="num ${(rw.spread ?? 0) >= 0 ? "pos" : "neg"}"><strong>${pctOrDash(rw.spread ?? null)}</strong></td></tr>`);
    const inp = rw.inputs;
    if (inp) {
      if (inp.nopat != null) rows.push(`<tr><td class="num" style="color:${tokens.color.muted}">NOPAT</td><td class="num">${fmtCurrencyShort(inp.nopat)}</td></tr>`);
      if (inp.invested_capital != null) rows.push(`<tr><td class="num" style="color:${tokens.color.muted}">Invested capital</td><td class="num">${fmtCurrencyShort(inp.invested_capital)}</td></tr>`);
      if (inp.cost_of_equity != null) rows.push(`<tr><td class="num" style="color:${tokens.color.muted}">Cost of equity</td><td class="num">${pctOrDash(inp.cost_of_equity)}</td></tr>`);
      if (inp.after_tax_cost_of_debt != null) rows.push(`<tr><td class="num" style="color:${tokens.color.muted}">After-tax kd</td><td class="num">${pctOrDash(inp.after_tax_cost_of_debt)}</td></tr>`);
    }
    const interp = rw.interpretation ? `<p style="font-size:${tokens.size.small}pt;color:${tokens.color.muted};margin-top:${tokens.space.xs}pt;">${esc(rw.interpretation)}</p>` : "";
    sections.push(
      `<h3>Return on capital vs cost of capital</h3>
       <table class="data" style="margin-top:${tokens.space.xs}pt;"><thead><tr><th>Metric</th><th class="num">Value</th></tr></thead><tbody>${rows.join("")}</tbody></table>${interp}`,
    );
  }

  const riskRows = (i.risks ?? []).map(
    (r) => `<tr><td><strong>${esc(r.name)}</strong></td><td>${esc(r.desc)}</td></tr>`,
  );
  if (i.diversification) {
    riskRows.push(`<tr><td><strong>Diversification</strong></td><td>${esc(i.diversification)}</td></tr>`);
  }
  const riskTable = riskRows.length
    ? `<table class="data" style="margin-top:${tokens.space.sm}pt;"><thead><tr><th>Key risks</th><th>Notes</th></tr></thead><tbody>${riskRows.join("")}</tbody></table>`
    : "";

  return `<div class="instr">
    <div class="head">
      <span class="ticker">${esc(i.ticker)}</span>
      <span class="name">${tag}${esc(i.name ?? "")}</span>
      <span class="alloc">${esc(i.allocation ?? "")}</span>
    </div>
    ${metricLine}
    ${sections.join("")}
    ${riskTable}
  </div>`;
}

function implementationSteps(input: MemoInput): string {
  const impl = input.implementation ?? [];
  const triggers = input.rebalance_triggers ?? [];
  if (!impl.length && !triggers.length) return "";

  const steps = impl.length
    ? `<ol>${impl
        .map((r) => {
          const verb = r.change >= 0 ? "Add" : "Trim";
          return `<li><strong>${esc(verb)} ${pct(r.change) ?? ""}</strong> to ${esc(r.sleeve)}${r.instrument ? ` via ${esc(r.instrument)}` : ""}. Target ${pctPlain(r.target) ?? ""} (current ${pctPlain(r.current) ?? ""}).</li>`;
        })
        .join("")}</ol>`
    : "";

  const trig = triggers.length
    ? `<h2 class="sub">Portfolio-level risk note</h2><ul>${triggers.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
    : "";

  return `<section><h1 class="section">Implementation</h1>${steps}${trig}</section>`;
}

/* ============================== methodology, sources, disclosures ============================== */

function methodologyAndDisclosures(input: MemoInput): string {
  const m = input.methodology ?? [];
  const s = input.sources ?? [];
  const d = input.disclosures;
  if (!m.length && !s.length && !d) return "";

  const mBlock = m.length
    ? `<h2 class="sub">Methodology</h2><ul>${m.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`
    : "";
  const sBlock = s.length
    ? `<h2 class="sub">Sources</h2><ul>${s.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`
    : "";
  const dBlock = d ? `<div class="disclosure">${esc(d)}</div>` : "";

  return `<section><h1 class="section">Methodology, sources and disclosures</h1>${mBlock}${sBlock}${dBlock}</section>`;
}