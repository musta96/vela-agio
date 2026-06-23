import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";

type ConvMsg = { role: "user" | "assistant"; content: string };

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

/** Lightly normalise markdown to plain text for PDF rendering. */
function stripMd(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*(?!\s)([^*\n]+)\*/g, "$1")
    .replace(/_(?!\s)([^_\n]+)_/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/`([^`]+)`/g, "$1");
}

function renderConversationSection(doc: jsPDF, messages: ConvMsg[], heading: string, startY: number): number {
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const usableW = pageW - margin * 2;
  let y = startY;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  if (y > pageH - margin - 40) { doc.addPage(); y = margin; }
  doc.text(heading, margin, y);
  y += 22;

  for (const m of messages) {
    if (!m.content?.trim()) continue;
    const label = m.role === "user" ? "You" : "Vela";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    if (y > pageH - margin - 20) { doc.addPage(); y = margin; }
    doc.text(label, margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(stripMd(m.content), usableW);
    for (const line of lines) {
      if (y > pageH - margin) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += 16;
    }
    y += 8;
  }
  return y;
}

async function translateMessages(messages: ConvMsg[], targetLang: "en" | "it"): Promise<ConvMsg[]> {
  try {
    const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL;
    const KEY = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
    const texts = messages.map(m => m.content || "");
    const r = await fetch(`${SUPABASE_URL}/functions/v1/translate-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ targetLang, texts }),
    });
    const j = await r.json();
    const out: string[] = Array.isArray(j?.translations) ? j.translations : texts;
    return messages.map((m, i) => ({ role: m.role, content: out[i] ?? m.content }));
  } catch {
    return messages;
  }
}

/**
 * Generate a single PDF containing the FULL conversation in English and Italian,
 * one section after the other. Falls back to original text if translation fails.
 */
export async function downloadBilingualConversationAsPdf(
  messages: ConvMsg[],
  filename = `vela-conversation-${new Date().toISOString().slice(0, 10)}.pdf`,
  sourceLang: "en" | "it" = "en",
) {
  const clean = messages.filter(m => m && m.content && m.content.trim().length > 0);
  // Translate so we always have both languages, regardless of source.
  const [enMsgs, itMsgs] = await Promise.all([
    sourceLang === "en" ? Promise.resolve(clean) : translateMessages(clean, "en"),
    sourceLang === "it" ? Promise.resolve(clean) : translateMessages(clean, "it"),
  ]);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  let y = margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Vela Assistant - Full Conversation", margin, y);
  y += 24;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(new Date().toLocaleString(), margin, y);
  y += 20;

  y = renderConversationSection(doc, enMsgs, "English", y);
  doc.addPage();
  renderConversationSection(doc, itMsgs, "Italiano", margin);

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