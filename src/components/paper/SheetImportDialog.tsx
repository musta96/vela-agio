import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileSpreadsheet, Upload } from "lucide-react";

export type ParsedRow = {
  symbol: string;
  name: string | null;
  side: "buy" | "sell";
  quantity: number;
  price: number | null;
  currency: string | null;
  executedAt: string | null;
};

type FieldKey = "symbol" | "name" | "side" | "quantity" | "price" | "currency" | "date";

const FIELDS: { key: FieldKey; label: string; required?: boolean; hint: string }[] = [
  { key: "symbol", label: "Ticker / ISIN", required: true, hint: "e.g. AAPL, A2A.MI, IE00BK5BQT80" },
  { key: "quantity", label: "Quantity", required: true, hint: "Number of shares or units" },
  { key: "price", label: "Price paid", hint: "Left empty = today's live price is used" },
  { key: "side", label: "Buy / Sell", hint: "Anything reading sell / vendita counts as a sale" },
  { key: "name", label: "Instrument name", hint: "Optional label" },
  { key: "currency", label: "Currency", hint: "Defaults to the portfolio currency" },
  { key: "date", label: "Trade date", hint: "Optional" },
];

/** Best-guess mapping so most broker exports need no manual work. */
const GUESSES: Record<FieldKey, RegExp> = {
  symbol: /^(symbol|ticker|isin|instrument|strumento|titolo|codice)/i,
  name: /^(name|description|nome|denominazione|descrizione)/i,
  side: /^(side|action|type|operation|operazione|segno|tipo)/i,
  quantity: /^(quantity|qty|shares|units|quantit|pezzi|numero)/i,
  price: /^(price|cost|avg|prezzo|costo|carico)/i,
  currency: /^(currency|ccy|valuta|divisa)/i,
  date: /^(date|executed|trade date|data|valuta data)/i,
};

const numeric = (raw: unknown): number | null => {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  // Handles "1.234,56" (IT) and "1,234.56" (EN).
  let s = raw.replace(/[^\d.,-]/g, "").trim();
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Called with the mapped rows once the user confirms. */
  onImport: (rows: ParsedRow[]) => Promise<void> | void;
}

/**
 * Spreadsheet importer with an explicit column-mapping step: the user uploads
 * an Excel/CSV export from any broker, picks the sheet, then tells us which
 * column holds which piece of data. Nothing is imported before the preview.
 */
export function SheetImportDialog({ open, onOpenChange, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState("");
  const [book, setBook] = useState<XLSX.WorkBook | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [map, setMap] = useState<Partial<Record<FieldKey, string>>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function loadSheet(wb: XLSX.WorkBook, name: string) {
    const ws = wb.Sheets[name];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: false });
    const cols = json.length ? Object.keys(json[0]) : [];
    setHeaders(cols);
    setRows(json);
    const guessed: Partial<Record<FieldKey, string>> = {};
    for (const f of FIELDS) {
      const hit = cols.find((c) => GUESSES[f.key].test(String(c).trim()));
      if (hit) guessed[f.key] = hit;
    }
    setMap(guessed);
  }

  async function onFile(file: File) {
    setError("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      if (!wb.SheetNames.length) throw new Error("This file has no sheets.");
      setBook(wb);
      setFileName(file.name);
      setSheets(wb.SheetNames);
      setSheet(wb.SheetNames[0]);
      loadSheet(wb, wb.SheetNames[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this file.");
    }
  }

  const parsed = useMemo<ParsedRow[]>(() => {
    if (!map.symbol || !map.quantity) return [];
    return rows
      .map((r) => {
        const symbol = String(r[map.symbol!] ?? "").trim().toUpperCase();
        const quantity = numeric(r[map.quantity!]);
        if (!symbol || !quantity) return null;
        const sideRaw = map.side ? String(r[map.side] ?? "").toLowerCase() : "";
        const dateRaw = map.date ? r[map.date] : null;
        const d = dateRaw ? new Date(String(dateRaw)) : null;
        return {
          symbol,
          name: map.name ? (String(r[map.name] ?? "").trim() || null) : null,
          side: /sell|sale|vend|short|-/.test(sideRaw) || quantity < 0 ? "sell" : "buy",
          quantity: Math.abs(quantity),
          price: map.price ? numeric(r[map.price]) : null,
          currency: map.currency ? (String(r[map.currency] ?? "").trim().toUpperCase() || null) : null,
          executedAt: d && !isNaN(d.getTime()) ? d.toISOString() : null,
        } as ParsedRow;
      })
      .filter((r): r is ParsedRow => r !== null);
  }, [rows, map]);

  function reset() {
    setBook(null); setFileName(""); setSheets([]); setSheet(""); setHeaders([]);
    setRows([]); setMap({}); setError("");
  }

  async function confirm() {
    setBusy(true);
    try {
      await onImport(parsed);
      reset();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Import positions from a spreadsheet
          </DialogTitle>
          <DialogDescription>
            Upload an Excel or CSV export from your broker, then tell us which column holds what.
            Nothing is added until you confirm the preview.
          </DialogDescription>
        </DialogHeader>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        {!book ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-4">Excel (.xlsx, .xls) or CSV, up to a few thousand rows.</p>
            <Button onClick={() => fileRef.current?.click()}>Choose file</Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium truncate max-w-[240px]">{fileName}</span>
              {sheets.length > 1 && (
                <>
                  <Label className="text-xs">Sheet</Label>
                  <Select
                    value={sheet}
                    onValueChange={(v) => { setSheet(v); if (book) loadSheet(book, v); }}
                  >
                    <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {sheets.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={reset}>Choose another file</Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <Label className="text-xs">
                    {f.label}{f.required && <span className="text-destructive"> *</span>}
                  </Label>
                  <Select
                    value={map[f.key] ?? "__none"}
                    onValueChange={(v) => setMap((m) => ({ ...m, [f.key]: v === "__none" ? undefined : v }))}
                  >
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Not in my file" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Not in my file</SelectItem>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">{f.hint}</p>
                </div>
              ))}
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">
                Preview · {parsed.length} row{parsed.length === 1 ? "" : "s"} ready
                {rows.length > parsed.length && (
                  <span className="text-muted-foreground font-normal"> ({rows.length - parsed.length} skipped: missing ticker or quantity)</span>
                )}
              </h4>
              <div className="rounded-md border max-h-64 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">Ticker</th>
                      <th className="text-left p-2">Side</th>
                      <th className="text-right p-2">Quantity</th>
                      <th className="text-right p-2">Price</th>
                      <th className="text-left p-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 50).map((r, i) => (
                      <tr key={`${r.symbol}-${i}`} className="border-t">
                        <td className="p-2 font-medium">{r.symbol}</td>
                        <td className="p-2 uppercase">{r.side}</td>
                        <td className="p-2 text-right tabular-nums">{r.quantity}</td>
                        <td className="p-2 text-right tabular-nums">{r.price ?? "live price"}</td>
                        <td className="p-2">{r.executedAt ? r.executedAt.slice(0, 10) : "today"}</td>
                      </tr>
                    ))}
                    {parsed.length === 0 && (
                      <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Pick at least the ticker and quantity columns.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={!parsed.length || busy}>
            {busy ? "Importing…" : `Import ${parsed.length || ""} row${parsed.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SheetImportDialog;
