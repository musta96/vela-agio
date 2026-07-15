import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  CandlestickChart,
  ChevronsUpDown,
  Check,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { TimingCard } from "@/components/timing/TimingCard";
import { STOCK_CATALOG } from "@/data/stockCatalog";
import { useOHLCHistory, type OHLCRange } from "@/hooks/useOHLCHistory";
import {
  analyze,
  bollinger,
  ema,
  macd as macdFn,
  rsi as rsiFn,
  sma,
  atr as atrFn,
  type Signal,
} from "@/lib/technicalIndicators";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { analyzeAll } from "@/lib/ta";
import { PatternToggleBar, DEFAULT_TOGGLES, type OverlayToggles } from "@/components/technical/PatternToggleBar";
import { InsightsCard } from "@/components/technical/InsightsCard";
import { DetectedPatternsCard } from "@/components/technical/DetectedPatternsCard";
import { TradePlannerCard } from "@/components/technical/TradePlannerCard";
import { AITradeThesisCard } from "@/components/technical/AITradeThesisCard";
import { TopDownCard } from "@/components/technical/TopDownCard";
import { StrategyBuilderCard } from "@/components/technical/StrategyBuilderCard";
import { BreakoutAlertsCard } from "@/components/technical/BreakoutAlertsCard";
import { PatternStrategyCard } from "@/components/technical/PatternStrategyCard";
import { TechnicalExportCard } from "@/components/technical/TechnicalExportCard";

const RANGES: OHLCRange[] = ["1M", "3M", "6M", "YTD", "1Y", "2Y", "5Y"];

const signalColor: Record<Signal, string> = {
  bullish: "text-success",
  bearish: "text-destructive",
  neutral: "text-muted-foreground",
};
const signalBg: Record<Signal, string> = {
  bullish: "bg-success/10 border-success/30",
  bearish: "bg-destructive/10 border-destructive/30",
  neutral: "bg-muted/30 border-border",
};
const SignalIcon = ({ s }: { s: Signal }) =>
  s === "bullish" ? (
    <TrendingUp className="h-4 w-4 text-success" />
  ) : s === "bearish" ? (
    <TrendingDown className="h-4 w-4 text-destructive" />
  ) : (
    <Minus className="h-4 w-4 text-muted-foreground" />
  );

const fmtDate = (t: number) => new Date(t).toLocaleDateString();

const TechnicalAnalysis = () => {
  const [symbol, setSymbol] = useState<string>("ENEL.MI");
  const [range, setRange] = useState<OHLCRange>("6M");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { bars, loading, error } = useOHLCHistory(symbol, range);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return STOCK_CATALOG;
    return STOCK_CATALOG.filter((s) =>
      `${s.symbol} ${s.name} ${s.market}`.toLowerCase().includes(q)
    );
  }, [search]);

  const selected = STOCK_CATALOG.find((s) => s.symbol === symbol);

  const chartData = useMemo(() => {
    if (bars.length === 0) return [];
    const closes = bars.map((b) => b.close);
    const s20 = sma(closes, 20);
    const s50 = sma(closes, 50);
    const s200 = sma(closes, 200);
    const e9 = ema(closes, 9);
    const bb = bollinger(closes, 20, 2);
    const r = rsiFn(closes, 14);
    const m = macdFn(closes);
    return bars.map((b, i) => ({
      t: b.t,
      close: b.close,
      sma20: s20[i],
      sma50: s50[i],
      sma200: s200[i],
      ema9: e9[i],
      bbUpper: bb[i].upper,
      bbLower: bb[i].lower,
      rsi: r[i],
      macd: m[i].macd,
      macdSignal: m[i].signal,
      macdHist: m[i].hist,
    }));
  }, [bars]);

  const summary = useMemo(() => analyze(bars), [bars]);

  // Advanced TA (patterns, structure, SMC, insights).
  const ta = useMemo(() => (bars.length ? analyzeAll(bars) : null), [bars]);
  const atrArr = useMemo(() => (bars.length ? atrFn(bars, 14) : []), [bars]);
  const lastAtr = atrArr.length ? atrArr[atrArr.length - 1] : null;
  const [overlays, setOverlays] = useState<OverlayToggles>(DEFAULT_TOGGLES);
  const overlayCounts = useMemo(() => {
    if (!ta) return {};
    return {
      sr: ta.supportResistance.length,
      trendlines: ta.trendlines.length,
      fvg: ta.fvgs.filter((f) => !f.filled).length,
      orderBlocks: ta.orderBlocks.length,
      supplyDemand: ta.supplyDemand.filter((z) => z.fresh).length,
      liquidity: ta.liquidityGrabs.length,
      candles: ta.candlestickPatterns.length,
      chartPatterns: ta.chartPatterns.length,
      structure: ta.structure.length,
    };
  }, [ta]);
  const lastBar = bars[bars.length - 1];

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <SEO title="Technical Analysis - RSI, MACD & Trend Signals" description="Analyze stocks with RSI, MACD, moving averages, and trend signals. Spot breakouts and reversals across FTSE MIB, EU, and US markets." path="/technical" />
      <TopNav />
      <main>

      <section className="container mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-2 flex items-center gap-3">
              <CandlestickChart className="h-8 w-8 text-primary" />
              Technical Analysis
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Chart reading with SMAs, EMA, Bollinger Bands, RSI, MACD, ATR, support/resistance and candlestick patterns.
            </p>
          </div>
        </div>

        {/* Controls */}
        <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
            <div className="relative">
              <label className="text-sm text-muted-foreground mb-2 block">Symbol</label>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between font-normal h-11"
                onClick={() => setPickerOpen((o) => !o)}
              >
                <span className="truncate">
                  {selected ? `${selected.symbol} - ${selected.name}` : "Pick a stock or ETF…"}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
              {pickerOpen && (
                <div className="absolute left-0 top-full z-[60] mt-2 w-full rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
                  <Input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by symbol, name, or market…"
                    className="rounded-b-none border-0 border-b border-border focus-visible:ring-0 focus-visible:ring-offset-0 h-11 text-base"
                  />
                  <div className="max-h-[60vh] sm:max-h-80 overflow-y-auto p-1">
                    {filtered.length === 0 ? (
                      <p className="px-3 py-6 text-center text-sm text-muted-foreground">No instrument found.</p>
                    ) : (
                      filtered.map((s) => (
                        <button
                          key={s.symbol}
                          type="button"
                          className="flex w-full items-center rounded-sm px-3 py-3 min-h-[44px] text-left text-sm hover:bg-accent hover:text-accent-foreground"
                          onClick={() => {
                            setSymbol(s.symbol);
                            setSearch("");
                            setPickerOpen(false);
                          }}
                        >
                          <Check className={`mr-2 h-4 w-4 ${symbol === s.symbol ? "opacity-100" : "opacity-0"}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{s.symbol}</span>
                              <Badge variant="outline" className="text-[10px]">{s.market}</Badge>
                            </div>
                            <p className="truncate text-xs text-muted-foreground">{s.name}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Range</label>
              <ToggleGroup
                type="single"
                value={range}
                onValueChange={(v) => v && setRange(v as OHLCRange)}
                className="justify-start"
              >
                {RANGES.map((r) => (
                  <ToggleGroupItem key={r} value={r} size="sm">
                    {r}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>
        </Card>

        {loading && (
          <Card className="p-8 text-center card-gradient border-border">
            <p className="text-muted-foreground">Loading chart data…</p>
          </Card>
        )}
        {error && !loading && (
          <Card className="p-8 text-center card-gradient border-destructive/40">
            <p className="text-destructive">{error}</p>
          </Card>
        )}

        {!loading && bars.length > 0 && (
          <>
            {/* Entry-timing verdict (technicals + fundamentals + macro proximity). */}
            <TimingCard symbol={symbol} />
            {/* Summary */}
            {summary && (
              <Card className={`p-4 sm:p-6 mb-6 border ${signalBg[summary.overall]}`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <SignalIcon s={summary.overall} />
                    <div>
                      <p className="text-sm text-muted-foreground">Overall read</p>
                      <p className={`text-2xl font-bold uppercase ${signalColor[summary.overall]}`}>
                        {summary.overall}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Composite score</p>
                    <p className="text-2xl font-bold">{summary.score > 0 ? "+" : ""}{summary.score}</p>
                    <p className="text-xs text-muted-foreground">Last close {summary.lastClose.toFixed(2)}</p>
                  </div>
                </div>
                {summary.patterns.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {summary.patterns.map((p) => (
                      <Badge key={p} variant="outline" className="text-xs">
                        Pattern: {p}
                      </Badge>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {/* Price + overlays */}
            <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
              <div className="flex flex-col gap-3 mb-3">
                <h3 className="text-lg font-semibold">Price · SMA 20/50/200 · Bollinger</h3>
                {ta && (
                  <PatternToggleBar toggles={overlays} counts={overlayCounts} onChange={setOverlays} />
                )}
              </div>
              <div className="w-full h-[360px]">
                <ResponsiveContainer>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="t" tickFormatter={fmtDate} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} domain={["auto", "auto"]} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                      labelFormatter={(t) => fmtDate(t as number)}
                      formatter={(v: number | string) =>
                        typeof v === "number" ? v.toFixed(2) : v
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="bbUpper" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted))" fillOpacity={0.08} name="BB upper" dot={false} />
                    <Area type="monotone" dataKey="bbLower" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--background))" fillOpacity={0} name="BB lower" dot={false} />
                    <Line type="monotone" dataKey="close" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Close" />
                    <Line type="monotone" dataKey="sma20" stroke="hsl(var(--success))" strokeWidth={1.5} dot={false} name="SMA 20" />
                    <Line type="monotone" dataKey="sma50" stroke="hsl(var(--accent-foreground))" strokeWidth={1.5} dot={false} name="SMA 50" />
                    <Line type="monotone" dataKey="sma200" stroke="hsl(var(--destructive))" strokeWidth={1.5} dot={false} name="SMA 200" />
                    {summary?.levels.map((lv, i) => (
                      <ReferenceLine
                        key={i}
                        y={lv.price}
                        stroke={lv.type === "support" ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                        strokeDasharray="4 4"
                        strokeOpacity={0.5}
                        label={{
                          value: `${lv.type === "support" ? "S" : "R"} ${lv.price.toFixed(2)}`,
                          fill: "hsl(var(--muted-foreground))",
                          fontSize: 10,
                          position: "right",
                        }}
                      />
                    ))}
                    {/* Advanced overlays */}
                    {ta && overlays.sr && ta.supportResistance.map((z, i) => (
                      <ReferenceLine
                        key={`ta-sr-${i}`}
                        y={z.price}
                        stroke={z.type === "support" ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                        strokeDasharray="2 3"
                        strokeOpacity={0.35 + 0.5 * z.strength}
                        label={{
                          value: `${z.type === "support" ? "S" : "R"} ${z.price.toFixed(2)} (${z.touches})`,
                          fill: "hsl(var(--muted-foreground))", fontSize: 9, position: "insideLeft",
                        }}
                      />
                    ))}
                    {ta && overlays.fvg && ta.fvgs.filter((f) => !f.filled).map((f, i) => (
                      <ReferenceArea
                        key={`ta-fvg-${i}`}
                        x1={bars[Math.max(0, f.index - 1)]?.t}
                        x2={lastBar?.t}
                        y1={f.bottom}
                        y2={f.top}
                        fill={f.bias === "bullish" ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                        fillOpacity={0.08}
                        stroke="none"
                      />
                    ))}
                    {ta && overlays.orderBlocks && ta.orderBlocks.map((o, i) => (
                      <ReferenceArea
                        key={`ta-ob-${i}`}
                        x1={bars[o.index]?.t}
                        x2={lastBar?.t}
                        y1={o.bottom}
                        y2={o.top}
                        fill={o.bias === "bullish" ? "hsl(var(--primary))" : "hsl(var(--destructive))"}
                        fillOpacity={0.12}
                        stroke={o.bias === "bullish" ? "hsl(var(--primary))" : "hsl(var(--destructive))"}
                        strokeOpacity={0.4}
                      />
                    ))}
                    {ta && overlays.supplyDemand && ta.supplyDemand.filter((z) => z.fresh).map((z, i) => (
                      <ReferenceArea
                        key={`ta-sd-${i}`}
                        x1={bars[z.from.index]?.t}
                        x2={lastBar?.t}
                        y1={z.bottom}
                        y2={z.top}
                        fill={z.bias === "bullish" ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                        fillOpacity={0.08}
                        stroke={z.bias === "bullish" ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                        strokeOpacity={0.3}
                        strokeDasharray="3 3"
                      />
                    ))}
                    {ta && overlays.trendlines && ta.trendlines.map((tl, i) => {
                      const y0 = tl.slope * tl.from.index + tl.intercept;
                      const y1 = tl.slope * (bars.length - 1) + tl.intercept;
                      return (
                        <ReferenceLine
                          key={`ta-tl-${i}`}
                          stroke={tl.kind === "up" ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                          strokeWidth={1.5}
                          strokeDasharray={tl.broken ? "6 3" : undefined}
                          strokeOpacity={0.8}
                          segment={[
                            { x: tl.from.t, y: y0 },
                            { x: lastBar?.t ?? tl.to.t, y: y1 },
                          ]}
                          label={{ value: `${tl.kind === "up" ? "Uptrend" : "Downtrend"}${tl.broken ? " (broken)" : ""}`, fill: "hsl(var(--muted-foreground))", fontSize: 9, position: "insideTopRight" }}
                        />
                      );
                    })}
                    {ta && overlays.candles && ta.candlestickPatterns.slice(-8).map((c, i) => (
                      <ReferenceDot
                        key={`ta-c-${i}`}
                        x={c.t}
                        y={c.bias === "bullish" ? c.priceLow : c.priceHigh}
                        r={4}
                        fill={c.bias === "bullish" ? "hsl(var(--success))" : c.bias === "bearish" ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))"}
                        stroke="hsl(var(--background))"
                        strokeWidth={1}
                        label={{ value: c.name, position: c.bias === "bullish" ? "bottom" : "top", fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                      />
                    ))}
                    {ta && overlays.liquidity && ta.liquidityGrabs.slice(-6).map((l, i) => (
                      <ReferenceDot
                        key={`ta-l-${i}`}
                        x={l.t}
                        y={l.sweptLevel}
                        r={5}
                        fill="none"
                        stroke={l.bias === "bullish" ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                        strokeWidth={2}
                        label={{ value: `LG ${l.bias === "bullish" ? "↑" : "↓"}`, position: l.bias === "bullish" ? "bottom" : "top", fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                      />
                    ))}
                    {ta && overlays.structure && ta.structure.slice(-4).map((s, i) => (
                      <ReferenceLine
                        key={`ta-str-${i}`}
                        y={s.level}
                        stroke={s.bias === "bullish" ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                        strokeDasharray="1 3"
                        strokeOpacity={0.6}
                        label={{ value: `${s.kind} ${s.bias === "bullish" ? "↑" : "↓"} ${s.level.toFixed(2)}`, fill: "hsl(var(--muted-foreground))", fontSize: 9, position: "right" }}
                      />
                    ))}
                    {ta && overlays.chartPatterns && ta.chartPatterns.map((p, i) => (
                      <ReferenceLine
                        key={`ta-cp-${i}`}
                        y={p.keyPrice}
                        stroke="hsl(var(--primary))"
                        strokeDasharray="4 2"
                        strokeOpacity={0.7}
                        label={{ value: `${p.name} @ ${p.keyPrice.toFixed(2)}`, fill: "hsl(var(--primary))", fontSize: 9, position: "insideBottomLeft" }}
                      />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* RSI */}
            <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
              <h3 className="text-lg font-semibold mb-3">RSI (14)</h3>
              <div className="w-full h-[180px]">
                <ResponsiveContainer>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="t" tickFormatter={fmtDate} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                      labelFormatter={(t) => fmtDate(t as number)}
                      formatter={(v: number | string) => (typeof v === "number" ? v.toFixed(1) : v)}
                    />
                    <ReferenceLine y={70} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
                    <ReferenceLine y={30} stroke="hsl(var(--success))" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="rsi" stroke="hsl(var(--primary))" dot={false} name="RSI" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* MACD */}
            <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
              <h3 className="text-lg font-semibold mb-3">MACD (12, 26, 9)</h3>
              <div className="w-full h-[200px]">
                <ResponsiveContainer>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="t" tickFormatter={fmtDate} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                      labelFormatter={(t) => fmtDate(t as number)}
                      formatter={(v: number | string) => (typeof v === "number" ? v.toFixed(3) : v)}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--border))" />
                    <Bar dataKey="macdHist" name="Histogram" fill="hsl(var(--muted-foreground))" opacity={0.6} />
                    <Line type="monotone" dataKey="macd" stroke="hsl(var(--primary))" dot={false} name="MACD" />
                    <Line type="monotone" dataKey="macdSignal" stroke="hsl(var(--destructive))" dot={false} name="Signal" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Advanced TA modules */}
            {ta && (
              <>
                <InsightsCard insights={ta.insights} />
                <DetectedPatternsCard analysis={ta} />
                {lastBar && (
                  <TradePlannerCard
                    lastPrice={lastBar.close}
                    atr={lastAtr}
                    zones={ta.supportResistance}
                  />
                )}
                {lastBar && (
                  <AITradeThesisCard
                    symbol={symbol}
                    name={selected?.name}
                    timeframe={range}
                    lastBarTs={lastBar.t}
                    lastPrice={lastBar.close}
                    analysis={ta}
                  />
                )}
                <TopDownCard symbol={symbol} />
                {lastBar && (
                  <BreakoutAlertsCard
                    symbol={symbol}
                    name={selected?.name}
                    bars={bars}
                    analysis={ta}
                  />
                )}
                <PatternStrategyCard symbol={symbol} timeframe={range} analysis={ta} />
                <StrategyBuilderCard symbol={symbol} timeframe={range} />
                {lastBar && (
                  <TechnicalExportCard
                    symbol={symbol}
                    name={selected?.name}
                    timeframe={range}
                    lastPrice={lastBar.close}
                    atr={lastAtr}
                    analysis={ta}
                  />
                )}
              </>
            )}

            {/* Signals breakdown */}
            {summary && (
              <Card className="p-4 sm:p-6 mb-6 card-gradient border-border">
                <h3 className="text-lg font-semibold mb-4">Indicator breakdown</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {summary.signals.map((s) => (
                    <div
                      key={s.name}
                      className={`p-3 rounded-md border ${signalBg[s.signal]} flex items-start gap-3`}
                    >
                      <SignalIcon s={s.signal} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">{s.name}</p>
                          <Badge variant="outline" className={`text-[10px] ${signalColor[s.signal]}`}>
                            {s.signal}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{s.value}</p>
                        <p className="text-xs mt-1">{s.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Levels */}
            {summary && summary.levels.length > 0 && (
              <Card className="p-4 sm:p-6 card-gradient border-border">
                <h3 className="text-lg font-semibold mb-4">Key levels (swing pivots)</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {summary.levels.map((lv, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-md border text-center ${
                        lv.type === "support"
                          ? "border-success/30 bg-success/10"
                          : "border-destructive/30 bg-destructive/10"
                      }`}
                    >
                      <p className={`text-xs uppercase ${lv.type === "support" ? "text-success" : "text-destructive"}`}>
                        {lv.type}
                      </p>
                      <p className="text-lg font-bold">{lv.price.toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground">{lv.touches} touch{lv.touches > 1 ? "es" : ""}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </section>
    </main>
    </div>
  );
};

export default TechnicalAnalysis;