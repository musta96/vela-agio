import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Gauge } from "lucide-react";
import type { CompanyProfileData } from "@/hooks/useCompanyProfile";

interface Props {
  data: CompanyProfileData | null;
  loading: boolean;
}

function fmtNum(v: unknown, digits = 2): string {
  const n = typeof v === "number" ? v : null;
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e5) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toFixed(digits);
}

function fmtPct(v: unknown, alreadyPct = false): string {
  const n = typeof v === "number" ? v : null;
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(alreadyPct ? n : n * 100).toFixed(2)}%`;
}

function Group({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{title}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {items.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-2 border-b border-border/40 py-1">
            <dt className="text-xs text-muted-foreground truncate">{k}</dt>
            <dd className="text-sm font-mono">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Fineco-style "Indicatori" sheet: price range, valuation multiples,
 * profitability, balance-sheet health, dividend policy and analyst targets.
 */
export function KeyIndicatorsCard({ data, loading }: Props) {
  const i = data?.indicators ?? {};
  const cur = data?.currency ?? "";

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading key indicators…
        </CardContent>
      </Card>
    );
  }
  if (!data || data.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4" /> Key indicators</CardTitle>
          <CardDescription>{data?.message ?? "No fundamentals provider covers this listing yet."}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4" /> Key indicators</CardTitle>
          <CardDescription>
            {[data.profile?.sector, data.profile?.industry, data.profile?.exchange].filter(Boolean).join(" · ") || "Market data"}
          </CardDescription>
        </div>
        {cur && <Badge variant="outline">{cur}</Badge>}
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Group
          title="Price & liquidity"
          items={[
            ["Previous close", fmtNum(i.previousClose)],
            ["Open", fmtNum(i.open)],
            ["Day range", `${fmtNum(i.dayLow)} – ${fmtNum(i.dayHigh)}`],
            ["52w range", `${fmtNum(i.week52Low)} – ${fmtNum(i.week52High)}`],
            ["50d average", fmtNum(i.fiftyDayAverage)],
            ["200d average", fmtNum(i.twoHundredDayAverage)],
            ["Volume", fmtNum(i.volume, 0)],
            ["Avg volume (3m)", fmtNum(i.averageVolume, 0)],
            ["Beta", fmtNum(i.beta)],
            ["Free float", fmtNum(i.floatShares, 0)],
          ]}
        />
        <Group
          title="Valuation"
          items={[
            ["Market cap", fmtNum(i.marketCap)],
            ["Enterprise value", fmtNum(i.enterpriseValue)],
            ["P/E (trailing)", fmtNum(i.pe)],
            ["P/E (forward)", fmtNum(i.forwardPe)],
            ["PEG", fmtNum(i.peg)],
            ["P/B", fmtNum(i.pb)],
            ["P/S", fmtNum(i.ps)],
            ["EV/EBITDA", fmtNum(i.evEbitda)],
            ["EPS (trailing)", fmtNum(i.eps)],
            ["Book value/share", fmtNum(i.bookValue)],
          ]}
        />
        <Group
          title="Profitability & growth"
          items={[
            ["Revenue (TTM)", fmtNum(i.revenue)],
            ["EBITDA", fmtNum(i.ebitda)],
            ["Gross margin", fmtPct(i.grossMargin)],
            ["Operating margin", fmtPct(i.operatingMargin)],
            ["Net margin", fmtPct(i.profitMargin)],
            ["ROE", fmtPct(i.roe)],
            ["ROA", fmtPct(i.roa)],
            ["Revenue growth", fmtPct(i.revenueGrowth)],
            ["Earnings growth", fmtPct(i.earningsGrowth)],
            ["Free cash flow", fmtNum(i.freeCashflow)],
          ]}
        />
        <Group
          title="Financial health"
          items={[
            ["Total cash", fmtNum(i.totalCash)],
            ["Total debt", fmtNum(i.totalDebt)],
            ["Debt/Equity", fmtNum(i.debtToEquity)],
            ["Current ratio", fmtNum(i.currentRatio)],
            ["Quick ratio", fmtNum(i.quickRatio)],
            ["Shares outstanding", fmtNum(i.sharesOutstanding, 0)],
          ]}
        />
        <Group
          title="Dividend"
          items={[
            ["Dividend rate", fmtNum(i.dividendRate)],
            ["Dividend yield", fmtPct(i.dividendYield)],
            ["5y average yield", fmtPct(i.fiveYearAvgDividendYield, true)],
            ["Payout ratio", fmtPct(i.payoutRatio)],
            ["Last dividend", fmtNum(i.lastDividendValue)],
            ["Last dividend date", (i.lastDividendDate as string) ?? "—"],
          ]}
        />
        <Group
          title="Analyst consensus"
          items={[
            ["Target low", fmtNum(i.targetLow)],
            ["Target mean", fmtNum(i.targetMean)],
            ["Target high", fmtNum(i.targetHigh)],
            ["Analysts covering", fmtNum(i.numberOfAnalysts, 0)],
            ["Consensus", typeof i.recommendation === "string" ? i.recommendation.replace(/_/g, " ") : "—"],
            ["Short % of float", fmtPct(i.shortPercentOfFloat)],
          ]}
        />
      </CardContent>
    </Card>
  );
}
