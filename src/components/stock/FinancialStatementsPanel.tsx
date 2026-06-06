import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, FileText, Loader2 } from "lucide-react";

type Row = { year: string; values: Record<string, number | null> };
type Series = { label: string; rows: Row[]; metrics: string[] };

const PROXY = "https://api.allorigins.win/raw?url=";

const INC = ["totalRevenue", "grossProfit", "operatingIncome", "netIncome"];
const BS  = ["totalAssets", "totalLiab", "totalStockholderEquity", "longTermDebt"];
const CF  = ["totalCashFromOperatingActivities", "capitalExpenditures", "freeCashFlow"];

const LABELS: Record<string, string> = {
  totalRevenue: "Revenue",
  grossProfit: "Gross profit",
  operatingIncome: "Operating income",
  netIncome: "Net income",
  totalAssets: "Total assets",
  totalLiab: "Total liabilities",
  totalStockholderEquity: "Equity",
  longTermDebt: "Long-term debt",
  totalCashFromOperatingActivities: "Cash from ops",
  capitalExpenditures: "CapEx",
  freeCashFlow: "Free cash flow",
};

function pick(item: any, key: string): number | null {
  const v = item?.[key];
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v?.raw === "number") return v.raw;
  return null;
}

function toRows(history: any[] | undefined, keys: string[]): Row[] {
  if (!Array.isArray(history)) return [];
  return history
    .map((h) => {
      const year = h?.endDate?.fmt?.slice(0, 4) ?? "—";
      const values: Record<string, number | null> = {};
      keys.forEach((k) => {
        let v = pick(h, k);
        if (k === "freeCashFlow" && v == null) {
          const ops = pick(h, "totalCashFromOperatingActivities");
          const cap = pick(h, "capitalExpenditures");
          if (ops != null && cap != null) v = ops + cap; // capex is negative
        }
        values[k] = v;
      });
      return { year, values };
    })
    .slice(0, 4)
    .reverse(); // oldest → newest
}

function fmt(v: number | null) {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  return v.toLocaleString();
}

function pctDelta(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function detectRedFlags(series: { income: Row[]; balance: Row[]; cash: Row[] }): string[] {
  const flags: string[] = [];
  const last = (rows: Row[], k: string, off = 0) => rows[rows.length - 1 - off]?.values[k] ?? null;

  const rev2 = last(series.income, "totalRevenue", 1);
  const rev1 = last(series.income, "totalRevenue");
  const gm2 = (last(series.income, "grossProfit", 1) ?? 0) / (rev2 || 1);
  const gm1 = (last(series.income, "grossProfit") ?? 0) / (rev1 || 1);
  if (rev1 != null && rev2 != null && gm1 < gm2 - 0.03)
    flags.push("Gross margin compressed >3pp YoY — pricing/cost pressure.");

  const cfo2 = last(series.cash, "totalCashFromOperatingActivities", 1);
  const cfo1 = last(series.cash, "totalCashFromOperatingActivities");
  if (cfo1 != null && cfo2 != null && cfo1 < cfo2 * 0.8)
    flags.push("Operating cash flow deteriorated >20% YoY.");

  const debt2 = last(series.balance, "longTermDebt", 1);
  const debt1 = last(series.balance, "longTermDebt");
  const fcf1 = last(series.cash, "freeCashFlow");
  if (debt1 != null && debt2 != null && debt1 > debt2 * 1.15 && fcf1 != null && fcf1 < 0)
    flags.push("Long-term debt grew >15% while free cash flow turned negative.");

  const ni1 = last(series.income, "netIncome");
  if (ni1 != null && cfo1 != null && ni1 > 0 && cfo1 < ni1 * 0.5)
    flags.push("Net income meaningfully exceeds operating cash flow — quality of earnings concern.");

  return flags;
}

export function FinancialStatementsPanel({ symbol }: { symbol: string }) {
  const [loading, setLoading] = useState(true);
  const [income, setIncome] = useState<Row[]>([]);
  const [balance, setBalance] = useState<Row[]>([]);
  const [cash, setCash] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;
    let active = true;
    setLoading(true); setErr(null);
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=incomeStatementHistory,balanceSheetHistory,cashflowStatementHistory`;
    fetch(`${PROXY}${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!active) return;
        const r = j?.quoteSummary?.result?.[0];
        if (!r) { setErr("Statements unavailable for this symbol."); setLoading(false); return; }
        setIncome(toRows(r.incomeStatementHistory?.incomeStatementHistory, INC));
        setBalance(toRows(r.balanceSheetHistory?.balanceSheetStatements, BS));
        setCash(toRows(r.cashflowStatementHistory?.cashflowStatements, CF));
        setLoading(false);
      })
      .catch(() => { if (active) { setErr("Statements unavailable for this symbol."); setLoading(false); } });
    return () => { active = false; };
  }, [symbol]);

  const flags = useMemo(() => detectRedFlags({ income, balance, cash }), [income, balance, cash]);

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading financial statements…</div>;
  }
  if (err || (!income.length && !balance.length && !cash.length)) {
    return <div className="text-sm text-muted-foreground py-6">{err ?? "Not covered for this symbol."}</div>;
  }

  const blocks: Series[] = [
    { label: "Income statement", rows: income, metrics: INC },
    { label: "Balance sheet", rows: balance, metrics: BS },
    { label: "Cash flow", rows: cash, metrics: CF },
  ];

  return (
    <div className="space-y-6">
      {flags.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" /> Red-flag detector
            </CardTitle>
            <CardDescription>Descriptive heuristics from filed statements. Educational only.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm list-disc pl-5 space-y-1">
              {flags.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {blocks.map((b) => (
        <Card key={b.label}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> {b.label}</CardTitle>
            <CardDescription>Source: Yahoo Finance · as of latest filings</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left py-2 font-medium">Metric</th>
                  {b.rows.map((r) => <th key={r.year} className="text-right py-2 font-medium">{r.year}</th>)}
                  <th className="text-right py-2 font-medium">YoY Δ</th>
                </tr>
              </thead>
              <tbody>
                {b.metrics.map((m) => {
                  const last = b.rows[b.rows.length - 1]?.values[m] ?? null;
                  const prev = b.rows[b.rows.length - 2]?.values[m] ?? null;
                  const d = pctDelta(last, prev);
                  return (
                    <tr key={m} className="border-b last:border-0">
                      <td className="py-2">{LABELS[m] ?? m}</td>
                      {b.rows.map((r) => (
                        <td key={r.year} className="text-right font-mono py-2">{fmt(r.values[m])}</td>
                      ))}
                      <td className={`text-right font-mono py-2 ${d == null ? "" : d >= 0 ? "text-success" : "text-destructive"}`}>
                        {d == null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {b.rows.length === 0 && <Badge variant="outline" className="text-[10px] mt-2">Not covered</Badge>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}