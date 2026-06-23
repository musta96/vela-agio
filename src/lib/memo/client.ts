import { supabase } from "@/integrations/supabase/client";
import type { MemoInput } from "./schema";

export interface MemoResponse {
  pdf_base64?: string;
  html?: string;
  omitted?: string[];
  warning?: string;
}

/**
 * Request a memo PDF from the edge function and trigger a download / print
 * depending on what the server returned. The server is the only place where
 * the template and fallback rules run; the client is a thin delivery layer.
 */
export async function requestMemoPdf(input: MemoInput): Promise<MemoResponse> {
  const { data, error } = await supabase.functions.invoke<MemoResponse>(
    "generate-memo-pdf",
    { body: input },
  );
  if (error) throw error;
  if (!data) throw new Error("empty_response");

  const filename = `${(input.meta.title || "memo").replace(/[^\w.-]+/g, "_")}.pdf`;

  if (data.pdf_base64) {
    const bytes = Uint8Array.from(atob(data.pdf_base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/pdf" });
    triggerDownload(blob, filename);
  } else if (data.html) {
    openPrintWindow(data.html);
  }
  return data;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function openPrintWindow(html: string): void {
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Give the document a tick to paint, then invoke the print dialog.
  w.addEventListener("load", () => {
    setTimeout(() => w.print(), 250);
  });
}