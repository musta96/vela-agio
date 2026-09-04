import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Banknote, Briefcase, RefreshCw, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useInvestorOverview } from "@/hooks/useInvestorOverview";
import { usePortfolios } from "@/hooks/usePortfolios";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RequireBiometric } from "@/components/RequireBiometric";

function money(v: number, currency = "EUR") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(
    Number.isFinite(v) ? v : 0,
  );
}
function pct(v: number | null) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function tone(v: number) {
  return v > 0 ? "text-success" : v < 0 ? "text-destructive" : "text-muted-foreground";
}

interface Row {
  symbol: string;
  name: string;
  qty: number;
  avgPrice: number;
  livePrice: number | null;
  marketValue: number;
  unrealisedPnL: number;
  unrealisedPnLPct: number | null;
  source: "Holding" | "Paper";
}

function PortfolioOverviewInner() {
  const o = useInvestorOverview();
  const { activeId, primary } = usePortfolios();
  const { user } = useAuth();
  const [openingCash, setOpeningCash] = useState("");

  const rows = useMemo<Row[]>(() => {
    const fromBook: Row[] = o.positions.map((p) => ({
      symbol: p.holding.symbol,
      name: p.holding.name || p.holding.symbol,
      qty: p.holding.shares,
      avgPrice: p.holding.avg_price,
      livePrice: p.livePrice,
      marketValue: p.marketValue,
      unrealisedPnL: p.unrealisedPnL,
      unrealisedPnLPct: p.unrealisedPnLPct,
      source: "Holding",
    }));
    const fromPaper: Row[] = o.paperPositions.map((p) => ({
      symbol: p.symbol,
      name: p.name,
      qty: p.qty,
      avgPrice: p.avgPrice,
      livePrice: p.livePrice,
      marketValue: p.marketValue,
      unrealisedPnL: p.unrealisedPnL,
      unrealisedPnLPct: p.unrealisedPnLPct,
      source: "Paper",
    }));
    return [...fromBook, ...fromPaper].sort((a, b) => b.marketValue - a.marketValue);
  }, [o.positions, o.paperPositions]);

  async function openCashAccount() {
    const pid = activeId ?? primary?.id;
    const amount = Math.max(0, Number(openingCash.replace(",", ".")) || 0);
    if (!user || !pid || !amount) {
      toast.error("Enter an opening cash amount first.");
      return;
    }
    const { error } = await (supabase as any).from("paper_cash").upsert(
      { user_id: user.id, portfolio_id: pid, currency: o.currency, starting_cash: amount, cash: amount },
      { onConflict: "portfolio_id" },
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    setOpeningCash("");
    toast.success(`Cash account funded with ${money(amount, o.currency)}`);
    await o.refresh();
  }

  const kpis = [
    { label: "Total value", value: money(o.totalValue, o.currency), icon: Briefcase, hint: "Investments plus cash" },
    { label: "Invested", value: money(o.investedValue, o.currency), icon: TrendingUp, hint: `${rows.length} positions` },
    { label: "Cash", value: money(o.cashBalance, o.currency), icon: Banknote, hint: `${o.cashWeight.toFixed(1)}% of portfolio` },
  ];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Investor overview</h1>
          <p className="text-sm text-muted-foreground">
            {o.portfolio?.name ?? "Your portfolio"} · holdings, cash and profit or loss, updating live as trades are placed.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void o.refresh()} disabled={o.loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${o.loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <k.icon className="h-4 w-4" /> {k.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums">{k.value}</div>
              <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              {o.unrealisedPnL >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />} Unrealised P&L
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-semibold tabular-nums ${tone(o.unrealisedPnL)}`}>
              {money(o.unrealisedPnL, o.currency)}
            </div>
            <p className={`mt-1 text-xs ${tone(o.unrealisedPnL)}`}>{pct(o.unrealisedPnLPct)} on cost</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-semibold tabular-nums ${tone(o.dayPnL)}`}>{money(o.dayPnL, o.currency)}</div>
            <p className={`mt-1 text-xs ${tone(o.dayPnL)}`}>{pct(o.dayPnLPct)} since previous close</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" /> Cash
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {o.hasCashAccount ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xl font-semibold tabular-nums">{money(o.cashBalance, o.currency)}</span>
                <span className="text-xs text-muted-foreground">
                  Funded with {money(o.startingCash, o.currency)} · {o.cashWeight.toFixed(1)}% of total value
                </span>
              </div>
              <Progress value={Math.min(100, Math.max(0, o.cashWeight))} />
              <p className="text-xs text-muted-foreground">
                Cash moves automatically when you buy or sell in{" "}
                <Link className="underline" to="/trading">
                  Paper Trading
                </Link>
                .
              </p>
            </>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="grow">
                <p className="mb-2 text-sm text-muted-foreground">
                  No cash account yet for this portfolio. Set an opening balance to track buying power and P&L against it.
                </p>
                <Input
                  inputMode="decimal"
                  placeholder={`Opening cash in ${o.currency}`}
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  className="max-w-xs"
                />
              </div>
              <Button onClick={() => void openCashAccount()}>Open cash account</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Holdings</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No positions yet. Add holdings on the{" "}
              <Link className="underline" to="/portfolio">
                Portfolio
              </Link>{" "}
              page or place a simulated trade in{" "}
              <Link className="underline" to="/trading">
                Paper Trading
              </Link>
              .
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Instrument</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Avg price</TableHead>
                    <TableHead className="text-right">Last</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={`${r.source}-${r.symbol}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{r.symbol}</span>
                          {r.source === "Paper" && <Badge variant="secondary">Paper</Badge>}
                        </div>
                        <div className="max-w-[220px] truncate text-xs text-muted-foreground">{r.name}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.qty.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.avgPrice, o.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.livePrice != null ? money(r.livePrice, o.currency) : <span className="text-muted-foreground">no quote</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.marketValue, o.currency)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${tone(r.unrealisedPnL)}`}>
                        {money(r.unrealisedPnL, o.currency)}
                        <div className="text-xs">{pct(r.unrealisedPnLPct)}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {o.investedValue > 0 ? `${((r.marketValue / o.investedValue) * 100).toFixed(1)}%` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent trades</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {o.trades.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No trades recorded for this portfolio yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Instrument</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Notional</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {o.trades.slice(0, 15).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(t.executed_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={t.side === "buy" ? "default" : "secondary"}>
                          {t.notes === "short_sell" ? "SHORT" : t.side.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{t.symbol}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.quantity.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(t.price, t.currency || o.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(t.quantity * t.price, t.currency || o.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PortfolioOverview() {
  return (
    <RequireBiometric reason="Unlock your investor dashboard">
      <PortfolioOverviewInner />
    </RequireBiometric>
  );
}
