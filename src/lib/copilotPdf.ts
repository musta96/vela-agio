import { jsPDF } from "jspdf";

/**
 * Render plain markdown-ish text into a multi-page A4 PDF.
 * Strips common markdown tokens so the output reads cleanly without
 * pulling in a heavy markdown→PDF pipeline. Good enough for assistant
 * answers, strategy notes, etc.
 */
export function downloadTextAsPdf(text: string, filename = "vela-assistant.pdf", title?: string) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const usableW = pageW - margin * 2;
  let y = margin;

  if (title) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    const lines = doc.splitTextToSize(title, usableW);
    doc.text(lines, margin, y);
    y += lines.length * 20 + 8;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  // Lightly normalise markdown: bold/italic markers, bullets, headings.
  const cleaned = text
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*(?!\s)([^*\n]+)\*/g, "$1")
    .replace(/_(?!\s)([^_\n]+)_/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/`([^`]+)`/g, "$1");

  const paragraphs = cleaned.split(/\n{2,}/);
  for (const p of paragraphs) {
    const lines = doc.splitTextToSize(p.trim(), usableW);
    for (const line of lines) {
      if (y > pageH - margin) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += 16;
    }
    y += 6;
  }

  doc.save(filename);
}

/** Heuristic: did the user ask for a PDF in this message? */
export function userWantsPdf(text: string): boolean {
  const t = text.toLowerCase();
  return /\/pdf\b/.test(t)
    || /\b(as|in|to|a|the)\s+pdf\b/.test(t)
    || /\bdownload(?:able)?\s+pdf\b/.test(t)
    || /\bpdf\s+(file|format|version|document|copy)\b/.test(t)
    || /\bgenerate\s+a?\s*pdf\b/.test(t)
    || /\bcome\s+pdf\b/.test(t) // it
    || /\bin\s+pdf\b/.test(t);
}