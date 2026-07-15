// Export helpers for AI research notes. Two formats:
//  - Markdown (.md) via Blob download.
//  - Printable HTML that opens in a new window and triggers window.print()
//    so the user can Save as PDF from the OS print dialog.

export interface ExportContext {
  symbol: string;
  name?: string;
  mode: "filing" | "transcript";
  sourceUrl?: string;
  sourceLabel?: string;
  generatedAt?: string;
  model?: string;
  report: any;
}

function esc(s: any): string {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

export function toMarkdown(ctx: ExportContext): string {
  const r = ctx.report ?? {};
  const lines: string[] = [];
  lines.push(`# AI Equity Research Note — ${ctx.name ?? ctx.symbol} (${ctx.symbol})`);
  lines.push("");
  if (ctx.sourceLabel) lines.push(`**Source:** ${ctx.sourceLabel}`);
  if (ctx.sourceUrl) lines.push(`**Source URL:** ${ctx.sourceUrl}`);
  if (ctx.generatedAt) lines.push(`**Generated:** ${new Date(ctx.generatedAt).toLocaleString()}`);
  if (ctx.model) lines.push(`**Model:** ${ctx.model}`);
  if (r.reportType) lines.push(`**Report type:** ${r.reportType}${r.period ? ` — ${r.period}` : ""}`);
  lines.push("");

  if (r.executiveSummary) { lines.push("## Executive Summary"); lines.push(r.executiveSummary); lines.push(""); }
  if (r.businessOverview) { lines.push("## Business Overview"); lines.push(r.businessOverview); lines.push(""); }

  if (r.guidance?.summary) {
    lines.push("## Guidance");
    if (r.guidance.direction && r.guidance.direction !== "none") lines.push(`_Direction: ${r.guidance.direction}_`);
    lines.push(r.guidance.summary); lines.push("");
  }

  if (Array.isArray(r.keyMetrics) && r.keyMetrics.length) {
    lines.push("## Key Metrics");
    for (const m of r.keyMetrics) {
      lines.push(`- **${m.label}:** ${m.value ?? ""}${m.yoyChange ? ` (YoY ${m.yoyChange})` : ""}`);
      if (m.commentary) lines.push(`  - ${m.commentary}`);
      if (m.citation?.quote) lines.push(`  - _Cite (${m.citation.section ?? "source"}): "${m.citation.quote}"_`);
    }
    lines.push("");
  }

  if (Array.isArray(r.risks) && r.risks.length) {
    lines.push("## Risks");
    for (const x of r.risks) {
      lines.push(`- **[${x.severity ?? "?"} · ${x.category ?? ""}] ${x.title}**`);
      if (x.detail) lines.push(`  - ${x.detail}`);
      if (x.citation?.quote) lines.push(`  - _Cite (${x.citation.section ?? "source"}): "${x.citation.quote}"_`);
    }
    lines.push("");
  }

  if (Array.isArray(r.opportunities) && r.opportunities.length) {
    lines.push("## Opportunities");
    for (const o of r.opportunities) lines.push(`- **${o.title}** _(${o.horizon ?? ""} term)_ — ${o.detail ?? ""}`);
    lines.push("");
  }

  if (r.managementTone) {
    lines.push("## Management Tone");
    if (r.managementTone.sentiment) lines.push(`_Sentiment: ${r.managementTone.sentiment}${r.managementTone.confidence ? ` · confidence: ${r.managementTone.confidence}` : ""}_`);
    if (r.managementTone.commentary) lines.push(r.managementTone.commentary);
    const q = r.managementTone.notableQuotes;
    if (Array.isArray(q) && q.length) {
      lines.push("");
      lines.push("### Notable Quotes");
      for (const item of q) {
        if (typeof item === "string") lines.push(`> "${item}"`);
        else lines.push(`> "${item.quote}"${item.section ? `  — _${item.section}_` : ""}`);
      }
    }
    lines.push("");
  }

  if (r.capitalAllocation) { lines.push("## Capital Allocation"); lines.push(r.capitalAllocation); lines.push(""); }

  if (r.researchNote) { lines.push("## Research Note"); lines.push(r.researchNote); lines.push(""); }

  if (r.recommendation) {
    lines.push("## Recommendation");
    lines.push(`**Stance:** ${r.recommendation.stance ?? ""} — ${r.recommendation.timeframe ?? ""} term`);
    if (r.recommendation.rationale) lines.push(r.recommendation.rationale);
    lines.push("");
  }

  if (Array.isArray(r.redFlags) && r.redFlags.length) {
    lines.push("## Red Flags");
    for (const rf of r.redFlags) lines.push(`- ${rf}`);
    lines.push("");
  }

  if (Array.isArray(r.followUpQuestions) && r.followUpQuestions.length) {
    lines.push("## Follow-up Questions for Management");
    for (const q of r.followUpQuestions) lines.push(`- ${q}`);
    lines.push("");
  }

  lines.push("");
  lines.push("---");
  lines.push("_Not investment advice. AI-generated for research assistance only._");
  return lines.join("\n");
}

export function downloadMarkdown(ctx: ExportContext) {
  const md = toMarkdown(ctx);
  const filename = `research-${ctx.symbol}-${(ctx.sourceLabel || ctx.mode).replace(/[^\w-]+/g, "_")}.md`;
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function toHtml(ctx: ExportContext): string {
  const r = ctx.report ?? {};
  const cite = (c: any) => c?.quote
    ? `<div class="cite"><span class="sec">${esc(c.section || "source")}</span><blockquote>&ldquo;${esc(c.quote)}&rdquo;</blockquote></div>`
    : "";
  const list = (items: any[] | undefined, fn: (x: any) => string) => Array.isArray(items) && items.length
    ? `<ul>${items.map(fn).join("")}</ul>` : "";

  const metrics = list(r.keyMetrics, (m: any) => `<li>
      <div class="row"><strong>${esc(m.label)}</strong><span class="val">${esc(m.value ?? "")}${m.yoyChange ? ` <span class="yoy">YoY ${esc(m.yoyChange)}</span>` : ""}</span></div>
      ${m.commentary ? `<div class="muted">${esc(m.commentary)}</div>` : ""}
      ${cite(m.citation)}
    </li>`);

  const risks = list(r.risks, (x: any) => `<li>
      <div><span class="badge sev-${esc(x.severity)}">${esc(x.severity ?? "?")}</span> <span class="badge">${esc(x.category ?? "")}</span> <strong>${esc(x.title)}</strong></div>
      <div class="muted">${esc(x.detail ?? "")}</div>
      ${cite(x.citation)}
    </li>`);

  const opps = list(r.opportunities, (o: any) => `<li><strong>${esc(o.title)}</strong> <span class="muted">(${esc(o.horizon ?? "")} term)</span><div class="muted">${esc(o.detail ?? "")}</div></li>`);

  const quotes = Array.isArray(r.managementTone?.notableQuotes) ? r.managementTone.notableQuotes.map((q: any) => {
    const quote = typeof q === "string" ? q : q?.quote;
    const section = typeof q === "string" ? "" : q?.section;
    if (!quote) return "";
    return `<blockquote>&ldquo;${esc(quote)}&rdquo;${section ? `<footer>— ${esc(section)}</footer>` : ""}</blockquote>`;
  }).join("") : "";

  const redFlags = Array.isArray(r.redFlags) && r.redFlags.length
    ? `<h2>Red Flags</h2><ul>${r.redFlags.map((f: string) => `<li>${esc(f)}</li>`).join("")}</ul>` : "";

  const followups = Array.isArray(r.followUpQuestions) && r.followUpQuestions.length
    ? `<h2>Follow-up Questions for Management</h2><ul>${r.followUpQuestions.map((f: string) => `<li>${esc(f)}</li>`).join("")}</ul>` : "";

  return `<!doctype html><html><head><meta charset="utf-8"/>
  <title>Research Note — ${esc(ctx.symbol)}</title>
  <style>
    body{font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color:#111; padding:32px; max-width:820px; margin:auto; line-height:1.5; font-size:13px;}
    h1{font-size:22px;margin:0 0 4px} h2{font-size:15px;margin:20px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px} h3{font-size:13px;margin:12px 0 4px}
    .meta{color:#555;font-size:11px;margin-bottom:12px}
    .muted{color:#555;font-size:12px;margin-top:2px}
    ul{padding-left:18px;margin:4px 0}
    li{margin:6px 0}
    .row{display:flex;justify-content:space-between;gap:12px}
    .val{font-family: ui-monospace, SFMono-Regular, Menlo, monospace}
    .yoy{color:#555}
    .badge{display:inline-block;font-size:10px;padding:1px 6px;border-radius:8px;background:#eee;margin-right:4px;text-transform:capitalize}
    .sev-high{background:#fee;color:#a00} .sev-medium{background:#fef3c7;color:#8a5a00} .sev-low{background:#eef;color:#245}
    .cite{margin:4px 0 0 0;padding:6px 8px;background:#f7f7f7;border-left:3px solid #888;font-size:11px}
    .cite .sec{font-weight:600;font-size:10px;color:#333;text-transform:uppercase;letter-spacing:.03em}
    blockquote{margin:6px 0;padding:6px 10px;border-left:3px solid #888;background:#fafafa;font-style:italic}
    blockquote footer{display:block;font-style:normal;color:#555;font-size:11px;margin-top:2px}
    .disclaimer{margin-top:24px;color:#888;font-size:10px;border-top:1px solid #eee;padding-top:8px}
    @media print { body { padding:16px; } h2 { page-break-after: avoid; } li, blockquote { page-break-inside: avoid; } }
  </style></head><body>
  <h1>AI Equity Research Note — ${esc(ctx.name ?? ctx.symbol)} (${esc(ctx.symbol)})</h1>
  <div class="meta">
    ${ctx.sourceLabel ? `<div><strong>Source:</strong> ${esc(ctx.sourceLabel)}</div>` : ""}
    ${ctx.sourceUrl ? `<div><strong>URL:</strong> <a href="${esc(ctx.sourceUrl)}">${esc(ctx.sourceUrl)}</a></div>` : ""}
    ${ctx.generatedAt ? `<div><strong>Generated:</strong> ${esc(new Date(ctx.generatedAt).toLocaleString())}</div>` : ""}
    ${ctx.model ? `<div><strong>Model:</strong> ${esc(ctx.model)}</div>` : ""}
    ${r.reportType ? `<div><strong>Report:</strong> ${esc(r.reportType)}${r.period ? ` — ${esc(r.period)}` : ""}</div>` : ""}
  </div>
  ${r.executiveSummary ? `<h2>Executive Summary</h2><p>${esc(r.executiveSummary)}</p>` : ""}
  ${r.businessOverview ? `<h2>Business Overview</h2><p>${esc(r.businessOverview)}</p>` : ""}
  ${r.guidance?.summary ? `<h2>Guidance ${r.guidance.direction && r.guidance.direction!=="none" ? `<span class="badge">${esc(r.guidance.direction)}</span>` : ""}</h2><p>${esc(r.guidance.summary)}</p>` : ""}
  ${metrics ? `<h2>Key Metrics</h2>${metrics}` : ""}
  ${risks ? `<h2>Risks</h2>${risks}` : ""}
  ${opps ? `<h2>Opportunities</h2>${opps}` : ""}
  ${r.managementTone?.commentary || quotes ? `<h2>Management Tone</h2>${r.managementTone?.sentiment ? `<div class="muted">Sentiment: ${esc(r.managementTone.sentiment)}${r.managementTone.confidence ? ` · confidence ${esc(r.managementTone.confidence)}` : ""}</div>` : ""}${r.managementTone?.commentary ? `<p>${esc(r.managementTone.commentary)}</p>` : ""}${quotes ? `<h3>Notable Quotes</h3>${quotes}` : ""}` : ""}
  ${r.capitalAllocation ? `<h2>Capital Allocation</h2><p>${esc(r.capitalAllocation)}</p>` : ""}
  ${r.researchNote ? `<h2>Research Note</h2><p>${esc(r.researchNote)}</p>` : ""}
  ${r.recommendation ? `<h2>Recommendation</h2><div class="muted">Stance: ${esc(r.recommendation.stance ?? "")}${r.recommendation.timeframe ? ` · ${esc(r.recommendation.timeframe)} term` : ""}</div>${r.recommendation.rationale ? `<p>${esc(r.recommendation.rationale)}</p>` : ""}` : ""}
  ${redFlags}
  ${followups}
  <div class="disclaimer">AI-generated research note. Not investment advice.</div>
  </body></html>`;
}

export function openPrintable(ctx: ExportContext) {
  const html = toHtml(ctx);
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* noop */ } }, 300);
}