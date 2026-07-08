import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gauge, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { computeRoic, computeWacc, pct, roicWaccSpread } from "@/lib/valuation/roicWacc";

const PROXY = "https://api.allorigins.win/raw?url=";

type YearRoic = { year: string; roic: number | null; nopat: number | null; ic: number | null };

function num(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v?.raw === "number") return v.raw;
  return null;
}

export function RoicWaccPanel({ symbol }: { symbol: string }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!symbol) return;
    let active = true;
    setLoading(true); setErr(null);
    const modules = [
      "incomeStatementHistory",
      "balanceSheetHistory",
      "financialData",
      "summaryDetail",
      "defaultKeyStatistics",
      "price",
    ].join(",");
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`;
    fetch(`${PROXY}${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!active) return;
        const r = j?.quoteSummary?.result?.[0];
        if (!r) { setErr("Not covered for this symbol."); setLoading(false); return; }
        setData(r); setLoading(false);
      })
      .catch(() => { if (active) { setErr("Not covered for this symbol."); setLoading(false); } });
    return () => { active = false; };
  }, [symbol]);

  const { roicHistory, roicLatest, wacc, spread } = useMemo(() => {
    if (!data) return { roicHistory: [] as YearRoic[], roicLatest: null as ReturnType<typeof computeRoic> | null, wacc: null as ReturnType<typeof computeWacc> | null, spread: null as number | null };
    const inc = data.incomeStatementHistory?.incomeStatementHistory ?? [];
    const bs = data.balanceSheetHistory?.balanceSheetStatements ?? [];
    const fd = data.financialData ?? {};
    const sd = data.summaryDetail ?? {};
    const price = data.price ?? {};

    const rows: YearRoic[] = inc.slice(0, 4).map((row: any, i: number) => {
      const b = bs[i] ?? {};
      const ebit = num(row.operatingIncome) ?? num(row.ebit);
      const tax = num(row.incomeTaxExpense);
      const pretax = num(row.incomeBeforeTax);
      const taxRate = tax != null && pretax && pretax !== 0 ? tax / pretax : null;
      const rr = computeRoic({
        ebit,
        taxRate,
        totalEquity: num(b.totalStockholderEquity),
        longTermDebt: num(b.longTermDebt),
        shortLongTermDebt: num(b.shortLongTermDebt),
        cash: num(b.cash),
      });
      return {
        year: row.endDate?.fmt?.slice(0, 4) ?? "-",
        roic: rr.roic,
        nopat: rr.nopat,
        ic: rr.investedCapital,
      };
    }).reverse();

    // Latest ROIC uses TTM financialData EBIT if available
    const b0 = bs[0] ?? {};
    const inc0 = inc[0] ?? {};
    const tax0 = num(inc0.incomeTaxExpense);
    const pretax0 = num(inc0.incomeBeforeTax);
    const latest = computeRoic({
      ebit: num(fd.ebitda) != null && num(inc0.depreciation) != null
        ? (num(fd.ebitda)! - (num(inc0.depreciation) ?? 0))
        : num(inc0.operatingIncome),
      taxRate: tax0 != null && pretax0 && pretax0 !== 0 ? tax0 / pretax0 : null,
      totalEquity: num(b0.totalStockholderEquity),
      longTermDebt: num(b0.longTermDebt),
      shortLongTermDebt: num(b0.shortLongTermDebt),
      cash: num(b0.cash),
    });

    const totalDebt = (num(b0.longTermDebt) ?? 0) + (num(b0.shortLongTermDebt) ?? 0);
    const w = computeWacc({
      marketCap: num(price.marketCap) ?? num(sd.marketCap),
      totalDebt,
      beta: num(sd.beta) ?? num(data.defaultKeyStatistics?.beta),
      taxRate: tax0 != null && pretax0 && pretax0 !== 0 ? tax0 / pretax0 : null,
    });

    return { roicHistory: rows, roicLatest: latest, wacc: w, spread: roicWaccSpread(latest.roic, w.wacc) };
  }, [data]);

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" /> Computing ROIC & WACC…</div>;
  }
  if (err || !roicLatest) {
    return <div className="text-sm text-muted-foreground py-6">{err ?? "Not enough data to compute ROIC / WACC."}</div>;
  }

  const spreadPositive = (spread ?? 0) >= 0;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4" /> Return on Invested Capital</CardTitle>
          <CardDescription>NOPAT ÷ (Equity + Debt − Cash). Efficiency of capital deployment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-3">
            <div className="text-3xl font-semibold font-mono">{pct(roicLatest.roic)}</div>
            <Badge variant="outline" className="text-[10px]">Effective tax {pct(roicLatest.taxRate)}</Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            NOPAT ≈ {fmtB(roicLatest.nopat)} · Invested capital ≈ {fmtB(roicLatest.investedCapital)}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wide border-b">
                <th className="text-left py-1 font-medium">Year</th>
                <th className="text-right py-1 font-medium">ROIC</th>
                <th className="text-right py-1 font-medium">NOPAT</th>
                <th className="text-right py-1 font-medium">IC</th>
              </tr>
            </thead>
            <tbody>
              {roicHistory.map((r) => (
                <tr key={r.year} className="border-b last:border-0">
                  <td className="py-1">{r.year}</td>
                  <td className="text-right font-mono py-1">{pct(r.roic)}</td>
                  <td className="text-right font-mono py-1">{fmtB(r.nopat)}</td>
                  <td className="text-right font-mono py-1">{fmtB(r.ic)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4" /> Weighted Avg Cost of Capital</CardTitle>
          <CardDescription>CAPM cost of equity + after-tax cost of debt, weighted by capital structure.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-3">
            <div className="text-3xl font-semibold font-mono">{pct(wacc?.wacc)}</div>
            {spread != null && (
              <Badge variant={spreadPositive ? "default" : "destructive"} className="text-[10px] flex items-center gap-1">
                {spreadPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                ROIC − WACC spread {pct(spread)}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Row k="Cost of equity" v={pct(wacc?.costOfEquity)} />
            <Row k="After-tax cost of debt" v={pct(wacc?.afterTaxCostOfDebt)} />
            <Row k="Equity weight" v={pct(wacc?.weightEquity)} />
            <Row k="Debt weight" v={pct(wacc?.weightDebt)} />
            <Row k="Beta" v={wacc?.assumptions.beta.toFixed(2) ?? "-"} />
            <Row k="Risk-free rate" v={pct(wacc?.assumptions.riskFreeRate)} />
            <Row k="Equity risk premium" v={pct(wacc?.assumptions.equityRiskPremium)} />
            <Row k="Pre-tax cost of debt" v={pct(wacc?.assumptions.preTaxCostOfDebt)} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Assumes 10Y-linked Rf 4.2% and ERP 5%. Educational estimate — not investment advice.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/40 pb-1">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
}

function fmtB(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "-";
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  return v.toLocaleString();
}