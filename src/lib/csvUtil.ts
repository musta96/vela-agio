/**
 * Tiny RFC-4180-ish CSV helpers + browser download trigger. Kept in one
 * place so any feature (Risk export, Goals export, future MC dumps) emits
 * an identically-formatted file.
 */

export type CsvCell = string | number | null | undefined;
export type CsvRow = CsvCell[];

export function csvEscape(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: CsvRow[]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, rows: CsvRow[]): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  // Prepend a BOM so Excel detects UTF-8 (€ etc.) without prompting.
  const blob = new Blob(["\ufeff" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}