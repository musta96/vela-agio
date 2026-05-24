import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TrendingUp, TrendingDown, LineChart as LineChartIcon } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  useHistoricalPrices,
  type HistoryRange,
} from "@/hooks/useHistoricalPrices";

export interface PortfolioHolding {
  symbol: string;
  shares: number;
  avgPrice: number;
}

interface Props {
  holdings: PortfolioHolding[];
  range: HistoryRange;
  onRangeChange: (r: HistoryRange) => void;
}

const RANGES: HistoryRange[] = ["1W", "1M", "3M", "6M", "YTD", "1Y"];

export const PortfolioPerformanceChart = ({ holdings, range, onRangeChange }: Props) => {
  const symbols = useMemo(() => holdings.map((h) => h.symbol), [holdings]);
  const { data, loading, error } = useHistoricalPrices(symbols, range);

  const costBasis = useMemo(
    () => holdings.reduce((s, h) => s + h.shares * h.avgPrice, 0),
    [holdings]
  );

  const chartData = useMemo(() => {
    if (holdings.length === 0) return [];
    // Build unified timeline from union of all timestamps
    const allTs = new Set<number>();
    holdings.forEach((h) => (data[h.symbol] || []).forEach((b) => allTs.add(b.t)));
    const sorted = Array.from(allTs).sort((a, b) => a - b);
    if (sorted.length === 0) return [];

    // Index of bars per symbol for forward-fill
    const symbolBars: Record<string, Map<number, number>> = {};
    holdings.forEach((h) => {
      const map = new Map<number, number>();
      (data[h.symbol] || []).forEach((b) => map.set(b.t, b.close));
      symbolBars[h.symbol] = map;
    });

    const lastClose: Record<string, number | null> = {};
    holdings.forEach((h) => (lastClose[h.symbol] = null));

    return sorted.map((t) => {
      let value = 0;
      holdings.forEach((h) => {
        const c = symbolBars[h.symbol].get(t);
        if (c !== undefined) lastClose[h.symbol] = c;
        const close = lastClose[h.symbol] ?? h.avgPrice;
        value += close * h.shares;
      });
      return {
        t,
        value: Math.round(value * 100) / 100,
        cost: Math.round(costBasis * 100) / 100,
      };
    });
  }, [data, holdings, costBasis]);

  const first = chartData[0]?.value ?? costBasis;
  const last = chartData[chartData.length - 1]?.value ?? costBasis;
  const periodGain = last - first;
  const periodPct = first > 0 ? (periodGain / first) * 100 : 0;
  const isPositive = periodGain >= 0;

  const formatDate = (t: number) => {
    const d = new Date(t);
    if (range === "1W") {
      return d.toLocaleDateString(undefined, { weekday: "short", hour: "2-digit" });
    }
    if (range === "1Y") {
      return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
    }
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <Card className="p-6 card-gradient border-border mb-8">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <LineChartIcon className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Portfolio Performance</h3>
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <p className="text-3xl font-bold">€{last.toFixed(2)}</p>
            <Badge
              variant={isPositive ? "default" : "destructive"}
              className={`gap-1 ${isPositive ? "bg-success/10 text-success hover:bg-success/20" : ""}`}
            >
              {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {isPositive ? "+" : ""}€{periodGain.toFixed(2)} ({isPositive ? "+" : ""}
              {periodPct.toFixed(2)}%)
            </Badge>
            <span className="text-sm text-muted-foreground">over {range}</span>
          </div>
        </div>
        <ToggleGroup
          type="single"
          value={range}
          onValueChange={(v) => v && onRangeChange(v as HistoryRange)}
          className="bg-muted/40 rounded-md p-1"
        >
          {RANGES.map((r) => (
            <ToggleGroupItem
              key={r}
              value={r}
              size="sm"
              className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground px-3"
            >
              {r}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="h-72 w-full">
        {holdings.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Add holdings to see your portfolio performance
          </div>
        ) : loading && chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Loading historical data…
          </div>
        ) : error && chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-destructive text-sm">
            {error}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis
                dataKey="t"
                tickFormatter={formatDate}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                minTickGap={40}
              />
              <YAxis
                domain={["auto", "auto"]}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `€${Number(v).toLocaleString()}`}
                width={70}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(t) => new Date(t as number).toLocaleString()}
                formatter={(value: number, name: string) => [
                  `€${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
                  name === "value" ? "Portfolio Value" : "Cost Basis",
                ]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#valueFill)"
                name="value"
              />
              <Line
                type="monotone"
                dataKey="cost"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                name="cost"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
};