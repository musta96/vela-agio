import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, FileText, Loader2, RefreshCw } from "lucide-react";
import { useCompanyProfile, type StatementRow } from "@/hooks/useCompanyProfile";

const INC = [
  "totalRevenue", "costOfRevenue", "grossProfit", "researchDevelopment",
  "sellingGeneralAdministrative", "operatingIncome", "interestExpense",
  "incomeBeforeTax", "incomeTaxExpense", "netIncome",
];
const BS = [
  "cash", "shortTermInvestments", "netReceivables", "inventory", "totalCurrentAssets",
  "propertyPlantEquipment", "goodWill", "totalAssets", "totalCurrentLiabilities",
  "longTermDebt", "totalLiab", "retainedEarnings", "totalStockholderEquity",
];
const CF = [
  "totalCashFromOperatingActivities", "capitalExpenditures", "totalCashflowsFromInvestingActivities",
  "totalCashFromFinancingActivities", "dividendsPaid", "repurchaseOfStock",
  "netBorrowings", "changeInCash", "freeCashFlow",
];

const LABELS: Record<string, string> = {
  totalRevenue: "Revenue",
  costOfRevenue: "Cost of revenue",
  grossProfit: "Gross profit",
  researchDevelopment: "R&D",
  sellingGeneralAdministrative: "SG&A",
  operatingIncome: "Operating income",
  interestExpense: "Interest expense",
  incomeBeforeTax: "Pre-tax income",
  incomeTaxExpense: "Income tax",
  netIncome: "Net income",
  cash: "Cash & equivalents",
  shortTermInvestments: "Short-term investments",
  netReceivables: "Receivables",
  inventory: "Inventory",
  totalCurrentAssets: "Current assets",
  propertyPlantEquipment: "PP&E",
  goodWill: "Goodwill",
  totalAssets: "Total assets",
  totalCurrentLiabilities: "Current liabilities",
  longTermDebt: "Long-term debt",
  totalLiab: "Total liabilities",
  retainedEarnings: "Retained earnings",
  totalStockholderEquity: "Equity",
  totalCashFromOperatingActivities: "Cash from operations",
  capitalExpenditures: "CapEx",
  totalCashflowsFromInvestingActivities: "Cash from investing",
  totalCashFromFinancingActivities: "Cash from financing",
  dividendsPaid: "Dividends paid",
  repurchaseOfStock: "Buybacks",
  netBorrowings: "Net borrowings",
  changeInCash: "Change in cash",
  freeCashFlow: "Free cash flow",
};

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

function detectRedFlags(series: { income: StatementRow[]; balance: StatementRow[]; cash: StatementRow[] }): string[] {
  const flags: string[] = [];
  const last = (rows: StatementRow[], k: string, off = 0) => rows[rows.length - 1 - off]?.values[k] ?? null;

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

/**
 * Full income statement, balance sheet and cash-flow statement, annual and
 * quarterly, sourced server-side (worldwide coverage) instead of the old
 * browser CORS proxy that failed for most non-US listings.
 */
export function FinancialStatementsPanel({ symbol }: { symbol: string }) {
  const { data, loading, error, reload } = useCompanyProfile(symbol);
  const [period, setPeriod] = useState<"annual" | "quarterly">("annual");

  const set = period === "annual" ? data?.statements?.annual : data?.statements?.quarterly;
  const income = set?.income ?? [];
  const balance = set?.balance ?? [];
  const cash = set?.cash ?? [];

  const flags = useMemo(() => detectRedFlags({ income, balance, cash }), [income, balance, cash]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading financial statements…
      </div>
    );
  }

  if (error || data?.error || (!income.length && !balance.length && !cash.length)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Financial statements</CardTitle>
          <CardDescription>
            {error ?? data?.message ?? `No filed statements available for ${symbol} on a ${period} basis.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void reload()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
          </Button>
          {period === "quarterly" && (
            <Button size="sm" variant="ghost" onClick={() => setPeriod("annual")}>Show annual instead</Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const blocks = [
    { label: "Income statement", rows: income, metrics: INC },
    { label: "Balance sheet", rows: balance, metrics: BS },
    { label: "Cash flow", rows: cash, metrics: CF },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {(["annual", "quarterly"] as const).map((p) => (
          <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)} className="capitalize">
            {p}
          </Button>
        ))}
        {data?.financialCurrency && <Badge variant="outline">Reported in {data.financialCurrency}</Badge>}
        <Button size="sm" variant="ghost" onClick={() => void reload()} className="ml-auto">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

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
            <CardDescription>Filed {period} figures · latest {b.rows.length} periods</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left py-2 font-medium">Metric</th>
                  {b.rows.map((r) => <th key={r.period} className="text-right py-2 font-medium">{r.period}</th>)}
                  <th className="text-right py-2 font-medium">Δ</th>
                </tr>
              </thead>
              <tbody>
                {b.metrics.map((m) => {
                  const values = b.rows.map((r) => r.values[m] ?? null);
                  if (values.every((v) => v == null)) return null;
                  const d = pctDelta(values[values.length - 1], values[values.length - 2]);
                  return (
                    <tr key={m} className="border-b last:border-0">
                      <td className="py-2">{LABELS[m] ?? m}</td>
                      {b.rows.map((r, idx) => (
                        <td key={r.period + idx} className="text-right font-mono py-2">{fmt(r.values[m] ?? null)}</td>
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
