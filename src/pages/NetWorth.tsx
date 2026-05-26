import { useEffect, useMemo, useState } from "react";
import { Link as RLink } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { usePortfolios } from "@/hooks/usePortfolios";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { supabase } from "@/integrations/supabase/client";
import {
  Wallet, Banknote, Briefcase, Home as HomeIcon, Car, Watch, Building2, Bitcoin,
  PiggyBank, Boxes, CreditCard, Plus, Pencil, Trash2, TrendingUp, TrendingDown,
  Camera, RefreshCw,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, BarChart, Bar,
} from "recharts";

// ---------- Categories ----------
type CategoryKey =
  | "cash" | "investments" | "retirement" | "crypto"
  | "real_estate" | "vehicles" | "collectibles" | "private_equity"
  | "other_assets" | "liabilities";

const CATEGORIES: Record<CategoryKey, { label: string; icon: any; color: string; liability?: boolean; hint: string }> = {
  cash:           { label: "Cash & Equivalents",   icon: Banknote,    color: "hsl(142 70% 45%)", hint: "Checking, savings, money market, T-bills" },
  investments:    { label: "Investments",          icon: Briefcase,   color: "hsl(199 89% 48%)", hint: "Stocks, ETFs, bonds — link a Vela portfolio for live values" },
  retirement:     { label: "Retirement / Pension", icon: PiggyBank,   color: "hsl(262 83% 58%)", hint: "401k, IRA, pension fund, fondo pensione" },
  crypto:         { label: "Crypto",               icon: Bitcoin,     color: "hsl(38 92% 50%)",  hint: "Wallets, exchanges — link a crypto-only portfolio" },
  real_estate:    { label: "Real Estate",          icon: HomeIcon,    color: "hsl(173 70% 40%)", hint: "Primary home, rentals, land" },
  vehicles:       { label: "Vehicles",             icon: Car,         color: "hsl(217 60% 55%)", hint: "Cars, motorcycles, boats" },
  collectibles:   { label: "Watches & Collectibles", icon: Watch,     color: "hsl(340 70% 55%)", hint: "Watches, art, wine, jewelry" },
  private_equity: { label: "Private Equity / Business", icon: Building2, color: "hsl(280 60% 55%)", hint: "Company shares, startups, partnerships" },
  other_assets:   { label: "Other Assets",         icon: Boxes,       color: "hsl(45 70% 50%)",  hint: "Loans receivable, royalties, anything else" },
  liabilities:    { label: "Liabilities",          icon: CreditCard,  color: "hsl(0 75% 55%)",   liability: true, hint: "Mortgages, loans, credit cards" },
};
const CATEGORY_ORDER: CategoryKey[] = [
  "cash","investments","retirement","crypto","real_estate","vehicles","collectibles","private_equity","other_assets","liabilities",
];

interface NWAccount {
  id: string;
  user_id: string;
  name: string;
  category: CategoryKey;
  subcategory: string | null;
  currency: string;
  notes: string | null;
  linked_portfolio_ids: string[] | null;
  manual_value: number;
  is_liability: boolean;
  include_in_total: boolean;
  sort_order: number;
}
interface NWSnapshot {
  id: string;
  account_id: string;
  snapshot_date: string;
  value: number;
  currency: string;
}

const fmt = (n: number, ccy = "EUR") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(n || 0);

const NetWorth = () => {
  const { user } = useAuth();
  const { portfolios } = usePortfolios();
  const { toast } = useToast();

  const [accounts, setAccounts] = useState<NWAccount[]>([]);
  const [snapshots, setSnapshots] = useState<NWSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<NWAccount> | null>(null);
  const [valueDialog, setValueDialog] = useState<NWAccount | null>(null);
  const [valueInput, setValueInput] = useState("");

  // ------- Load -------
  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [a, s] = await Promise.all([
      (supabase as any).from("net_worth_accounts").select("*").order("sort_order").order("created_at"),
      (supabase as any).from("net_worth_snapshots").select("*").order("snapshot_date"),
    ]);
    if (a.data) setAccounts(a.data as NWAccount[]);
    if (s.data) setSnapshots(s.data as NWSnapshot[]);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  // ------- Live portfolio valuation -------
  const [holdingsByPortfolio, setHoldingsByPortfolio] = useState<Record<string, { symbol: string; shares: number; avg_price: number; currency: string }[]>>({});
  useEffect(() => {
    if (!user || portfolios.length === 0) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("portfolio_holdings")
        .select("portfolio_id,symbol,shares,avg_price,currency");
      if (!data) return;
      const map: Record<string, any[]> = {};
      for (const h of data as any[]) {
        const pid = h.portfolio_id || "_legacy";
        (map[pid] ||= []).push(h);
      }
      setHoldingsByPortfolio(map);
    })();
  }, [user, portfolios.length]);

  const allLiveSymbols = useMemo(() => {
    const set = new Set<string>();
    Object.values(holdingsByPortfolio).forEach((arr) => arr.forEach((h) => set.add(h.symbol)));
    return Array.from(set);
  }, [holdingsByPortfolio]);
  const { quotes, refresh: refreshQuotes, loading: quotesLoading } = useLiveQuotes(allLiveSymbols, 60000);

  const computedAccountValue = (acc: NWAccount): number => {
    if (acc.linked_portfolio_ids && acc.linked_portfolio_ids.length > 0) {
      let total = 0;
      for (const pid of acc.linked_portfolio_ids) {
        const hs = holdingsByPortfolio[pid] || [];
        for (const h of hs) {
          const px = quotes[h.symbol]?.price ?? h.avg_price ?? 0;
          total += (h.shares || 0) * (px || 0);
        }
      }
      return total;
    }
    return Number(acc.manual_value) || 0;
  };

  // ------- Totals -------
  const totals = useMemo(() => {
    let assets = 0, liabilities = 0;
    const byCat: Record<CategoryKey, number> = Object.fromEntries(CATEGORY_ORDER.map((k) => [k, 0])) as any;
    for (const a of accounts) {
      if (!a.include_in_total) continue;
      const v = computedAccountValue(a);
      if (a.is_liability || a.category === "liabilities") liabilities += Math.abs(v);
      else { assets += v; byCat[a.category] = (byCat[a.category] || 0) + v; }
    }
    return { assets, liabilities, net: assets - liabilities, byCat };
    // eslint-disable-next-line
  }, [accounts, quotes, holdingsByPortfolio]);

  // ------- History -------
  const history = useMemo(() => {
    if (snapshots.length === 0) return [];
    const byDate: Record<string, Record<string, number>> = {};
    for (const s of snapshots) {
      const d = s.snapshot_date.slice(0, 7); // group monthly
      (byDate[d] ||= {})[s.account_id] = Number(s.value);
    }
    const dates = Object.keys(byDate).sort();
    const accMap = Object.fromEntries(accounts.map((a) => [a.id, a]));
    return dates.map((d) => {
      let assets = 0, liab = 0;
      for (const [aid, v] of Object.entries(byDate[d])) {
        const a = accMap[aid]; if (!a || !a.include_in_total) continue;
        if (a.is_liability || a.category === "liabilities") liab += Math.abs(v); else assets += v;
      }
      return { date: d, assets, liabilities: liab, net: assets - liab };
    });
  }, [snapshots, accounts]);

  const lastMonth = history.length >= 2 ? history[history.length - 2] : null;
  const monthChange = lastMonth ? totals.net - lastMonth.net : 0;
  const monthChangePct = lastMonth && lastMonth.net !== 0 ? (monthChange / Math.abs(lastMonth.net)) * 100 : 0;

  // ------- Mutations -------
  const saveAccount = async (a: Partial<NWAccount>) => {
    if (!user || !a.name || !a.category) return;
    const payload: any = {
      user_id: user.id,
      name: a.name,
      category: a.category,
      subcategory: a.subcategory || null,
      currency: a.currency || "EUR",
      notes: a.notes || null,
      linked_portfolio_ids: a.linked_portfolio_ids || [],
      manual_value: Number(a.manual_value) || 0,
      is_liability: a.category === "liabilities",
      include_in_total: a.include_in_total ?? true,
    };
    if (a.id) {
      await (supabase as any).from("net_worth_accounts").update(payload).eq("id", a.id);
    } else {
      await (supabase as any).from("net_worth_accounts").insert(payload);
    }
    setEditing(null);
    load();
    toast({ title: a.id ? "Account updated" : "Account added" });
  };

  const deleteAccount = async (id: string) => {
    if (!confirm("Delete this account and all its snapshots?")) return;
    await (supabase as any).from("net_worth_accounts").delete().eq("id", id);
    load();
  };

  const recordSnapshot = async (account: NWAccount, value: number) => {
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);
    await (supabase as any).from("net_worth_snapshots").upsert({
      user_id: user.id,
      account_id: account.id,
      snapshot_date: today,
      value,
      currency: account.currency,
    }, { onConflict: "account_id,snapshot_date" });
    // also persist manual_value if not linked
    if (!account.linked_portfolio_ids || account.linked_portfolio_ids.length === 0) {
      await (supabase as any).from("net_worth_accounts").update({ manual_value: value }).eq("id", account.id);
    }
    setValueDialog(null);
    setValueInput("");
    load();
    toast({ title: "Snapshot saved", description: "Today's value recorded." });
  };

  const snapshotAll = async () => {
    if (!user || accounts.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const rows = accounts.map((a) => ({
      user_id: user.id,
      account_id: a.id,
      snapshot_date: today,
      value: computedAccountValue(a),
      currency: a.currency,
    }));
    await (supabase as any).from("net_worth_snapshots").upsert(rows, { onConflict: "account_id,snapshot_date" });
    load();
    toast({ title: "Net worth snapshot saved", description: `${rows.length} accounts recorded for today.` });
  };

  // ------- Render -------
  const grouped = useMemo(() => {
    const g: Record<CategoryKey, NWAccount[]> = Object.fromEntries(CATEGORY_ORDER.map((k) => [k, []])) as any;
    for (const a of accounts) (g[a.category] ||= []).push(a);
    return g;
  }, [accounts]);

  const pieData = CATEGORY_ORDER
    .filter((k) => k !== "liabilities" && (totals.byCat[k] || 0) > 0)
    .map((k) => ({ name: CATEGORIES[k].label, value: totals.byCat[k], color: CATEGORIES[k].color, key: k }));

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <SEO title="Net Worth Tracker — Vela.ai" description="Track every asset and liability in one customisable dashboard." path="/net-worth" />
      <PageHeader
        icon={Wallet}
        title="Net Worth"
        description="A complete picture of what you own and what you owe — live-linked to your Vela portfolios."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={refreshQuotes} disabled={quotesLoading}>
              <RefreshCw className={`h-4 w-4 ${quotesLoading ? "animate-spin" : ""}`} /> Refresh prices
            </Button>
            <Button variant="outline" size="sm" onClick={snapshotAll} disabled={accounts.length === 0}>
              <Camera className="h-4 w-4" /> Snapshot today
            </Button>
            <Button size="sm" onClick={() => setEditing({ category: "cash", currency: "EUR", include_in_total: true, manual_value: 0, linked_portfolio_ids: [] })}>
              <Plus className="h-4 w-4" /> Add account
            </Button>
          </>
        }
      />

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPI title="Net Worth" value={fmt(totals.net)} accent change={monthChangePct} changeAbs={monthChange} />
          <KPI title="Total Assets" value={fmt(totals.assets)} icon={<TrendingUp className="h-4 w-4 text-success" />} />
          <KPI title="Total Liabilities" value={fmt(totals.liabilities)} icon={<TrendingDown className="h-4 w-4 text-destructive" />} />
          <KPI title="Accounts" value={String(accounts.length)} sub={`${Object.values(grouped).filter((g) => g.length).length} categories`} />
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-6 mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="p-5">
                <h3 className="text-sm font-semibold mb-3">Asset Allocation</h3>
                {pieData.length === 0 ? (
                  <EmptyHint text="Add accounts to see your allocation." />
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                          {pieData.map((d) => <Cell key={d.key} fill={d.color} />)}
                        </Pie>
                        <RTooltip formatter={(v: any) => fmt(Number(v))} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
              <Card className="p-5">
                <h3 className="text-sm font-semibold mb-3">Category breakdown</h3>
                <div className="space-y-2">
                  {CATEGORY_ORDER.filter((k) => k !== "liabilities").map((k) => {
                    const v = totals.byCat[k] || 0;
                    const pct = totals.assets > 0 ? (v / totals.assets) * 100 : 0;
                    const Icon = CATEGORIES[k].icon;
                    return (
                      <div key={k} className="flex items-center gap-3">
                        <div className="rounded-md p-2" style={{ backgroundColor: `${CATEGORIES[k].color}20` }}>
                          <Icon className="h-4 w-4" style={{ color: CATEGORIES[k].color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium truncate">{CATEGORIES[k].label}</span>
                            <span className="text-muted-foreground tabular-nums">{fmt(v)} · {pct.toFixed(1)}%</span>
                          </div>
                          <div className="h-1.5 mt-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: CATEGORIES[k].color }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {totals.liabilities > 0 && (
                    <div className="flex items-center gap-3 pt-2 border-t border-border mt-3">
                      <div className="rounded-md p-2 bg-destructive/20">
                        <CreditCard className="h-4 w-4 text-destructive" />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">Liabilities</span>
                          <span className="text-destructive tabular-nums">−{fmt(totals.liabilities)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            <Card className="p-5">
              <h3 className="text-sm font-semibold mb-3">Net worth over time</h3>
              {history.length < 2 ? (
                <EmptyHint text='Click "Snapshot today" each month to build your history.' />
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                      <RTooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                      <Legend />
                      <Line type="monotone" dataKey="net" stroke="hsl(var(--primary))" strokeWidth={2.5} name="Net worth" dot={false} />
                      <Line type="monotone" dataKey="assets" stroke="hsl(142 70% 45%)" strokeWidth={1.5} name="Assets" dot={false} />
                      <Line type="monotone" dataKey="liabilities" stroke="hsl(0 75% 55%)" strokeWidth={1.5} name="Liabilities" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* ACCOUNTS */}
          <TabsContent value="accounts" className="space-y-6 mt-4">
            {/* Category navigation grid — always visible so users see all categories and can drill in */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {CATEGORY_ORDER.map((k) => {
                const Icon = CATEGORIES[k].icon;
                const list = grouped[k] || [];
                const subtotal = list.reduce((s, a) => s + (a.include_in_total ? computedAccountValue(a) : 0), 0);
                return (
                  <RLink key={k} to={`/net-worth/${k}`}
                    className="group rounded-lg border border-border bg-card p-4 hover:border-primary/40 hover:shadow-md transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <div className="rounded-md p-2" style={{ backgroundColor: `${CATEGORIES[k].color}20` }}>
                        <Icon className="h-4 w-4" style={{ color: CATEGORIES[k].color }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{list.length} item{list.length === 1 ? "" : "s"}</span>
                    </div>
                    <p className="text-sm font-medium truncate">{CATEGORIES[k].label}</p>
                    <p className="text-sm font-bold tabular-nums mt-1">
                      {k === "liabilities" && subtotal > 0 ? "−" : ""}{fmt(subtotal)}
                    </p>
                    <p className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity mt-2">
                      Manage →
                    </p>
                  </RLink>
                );
              })}
            </div>

            {CATEGORY_ORDER.map((k) => {
              const list = grouped[k];
              if (!list || list.length === 0) return null;
              const Icon = CATEGORIES[k].icon;
              const subtotal = list.reduce((s, a) => s + (a.include_in_total ? computedAccountValue(a) : 0), 0);
              return (
                <Card key={k} className="overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-border" style={{ background: `${CATEGORIES[k].color}10` }}>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" style={{ color: CATEGORIES[k].color }} />
                      <h3 className="font-semibold">{CATEGORIES[k].label}</h3>
                      <span className="text-xs text-muted-foreground">· {CATEGORIES[k].hint}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-semibold tabular-nums">{fmt(subtotal)}</div>
                      <Button asChild size="sm" variant="outline"><RLink to={`/net-worth/${k}`}>Open detail →</RLink></Button>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="w-28"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.map((a) => {
                        const v = computedAccountValue(a);
                        const linked = (a.linked_portfolio_ids || []).map((pid) => portfolios.find((p) => p.id === pid)?.name).filter(Boolean);
                        return (
                          <TableRow key={a.id} className={a.include_in_total ? "" : "opacity-50"}>
                            <TableCell>
                              <div className="font-medium">{a.name}</div>
                              {a.subcategory && <div className="text-xs text-muted-foreground">{a.subcategory}</div>}
                            </TableCell>
                            <TableCell>
                              {linked.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {linked.map((n, i) => <Badge key={i} variant="secondary" className="text-[10px]">📊 {n}</Badge>)}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">Manual</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              {a.is_liability && v > 0 ? "−" : ""}{fmt(v, a.currency)}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                {(!a.linked_portfolio_ids || a.linked_portfolio_ids.length === 0) && (
                                  <Button size="icon" variant="ghost" title="Update value"
                                    onClick={() => { setValueDialog(a); setValueInput(String(a.manual_value || 0)); }}>
                                    <Camera className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" onClick={() => setEditing(a)}><Pencil className="h-4 w-4" /></Button>
                                <Button size="icon" variant="ghost" onClick={() => deleteAccount(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Card>
              );
            })}

            {accounts.length === 0 && !loading && (
              <Card className="p-10 text-center">
                <Wallet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-semibold mb-1">Start tracking your net worth</h3>
                <p className="text-sm text-muted-foreground mb-4">Add cash accounts, link your Vela portfolios, then add real estate, vehicles, watches — anything you own.</p>
                <Button onClick={() => setEditing({ category: "cash", currency: "EUR", include_in_total: true, manual_value: 0, linked_portfolio_ids: [] })}>
                  <Plus className="h-4 w-4" /> Add your first account
                </Button>
              </Card>
            )}
          </TabsContent>

          {/* HISTORY */}
          <TabsContent value="history" className="space-y-4 mt-4">
            <Card className="p-5">
              <h3 className="text-sm font-semibold mb-3">Monthly history</h3>
              {history.length === 0 ? (
                <EmptyHint text="No snapshots yet." />
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                      <RTooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                      <Legend />
                      <Bar dataKey="assets" stackId="a" fill="hsl(142 70% 45%)" name="Assets" />
                      <Bar dataKey="liabilities" stackId="b" fill="hsl(0 75% 55%)" name="Liabilities" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Assets</TableHead>
                    <TableHead className="text-right">Liabilities</TableHead>
                    <TableHead className="text-right">Net Worth</TableHead>
                    <TableHead className="text-right">Δ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...history].reverse().map((h, i, arr) => {
                    const prev = arr[i + 1];
                    const delta = prev ? h.net - prev.net : 0;
                    return (
                      <TableRow key={h.date}>
                        <TableCell className="font-medium">{h.date}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(h.assets)}</TableCell>
                        <TableCell className="text-right tabular-nums text-destructive">−{fmt(h.liabilities)}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{fmt(h.net)}</TableCell>
                        <TableCell className={`text-right tabular-nums ${delta >= 0 ? "text-success" : "text-destructive"}`}>
                          {prev ? `${delta >= 0 ? "+" : ""}${fmt(delta)}` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>

      {/* Edit / Add account dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit account" : "Add account"}</DialogTitle>
            <DialogDescription>Any asset or liability. Link a Vela portfolio for live valuation.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Revolut EUR, Rolex Submariner, Milan apartment" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Category</Label>
                  <Select value={editing.category} onValueChange={(v) => setEditing({ ...editing, category: v as CategoryKey })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORY_ORDER.map((k) => <SelectItem key={k} value={k}>{CATEGORIES[k].label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select value={editing.currency || "EUR"} onValueChange={(v) => setEditing({ ...editing, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["EUR","USD","GBP","CHF","JPY"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Subcategory (optional)</Label>
                <Input value={editing.subcategory || ""} onChange={(e) => setEditing({ ...editing, subcategory: e.target.value })} placeholder="e.g. Primary home, Watch, IRA" />
              </div>

              {(editing.category === "investments" || editing.category === "crypto" || editing.category === "retirement") && (
                <div className="rounded-md border border-border p-3 space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide">Link Vela portfolios (live value)</Label>
                  {portfolios.length === 0 && <p className="text-xs text-muted-foreground">No portfolios yet.</p>}
                  <div className="space-y-1.5 max-h-40 overflow-auto">
                    {portfolios.map((p) => {
                      const checked = (editing.linked_portfolio_ids || []).includes(p.id);
                      return (
                        <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox checked={checked} onCheckedChange={(c) => {
                            const cur = editing.linked_portfolio_ids || [];
                            setEditing({ ...editing, linked_portfolio_ids: c ? [...cur, p.id] : cur.filter((x) => x !== p.id) });
                          }} />
                          <span>{p.name}</span>
                          <span className="text-xs text-muted-foreground">{p.base_currency}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground">When portfolios are linked, value is computed live from holdings × current price.</p>
                </div>
              )}

              {(editing.linked_portfolio_ids || []).length === 0 && (
                <div>
                  <Label>Current value</Label>
                  <Input type="number" value={editing.manual_value ?? 0} onChange={(e) => setEditing({ ...editing, manual_value: Number(e.target.value) })} />
                </div>
              )}

              <div>
                <Label>Notes</Label>
                <Textarea rows={2} value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </div>

              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Include in net worth total</p>
                  <p className="text-xs text-muted-foreground">Turn off to track without affecting totals.</p>
                </div>
                <Switch checked={editing.include_in_total ?? true} onCheckedChange={(c) => setEditing({ ...editing, include_in_total: c })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => editing && saveAccount(editing)}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick value update */}
      <Dialog open={!!valueDialog} onOpenChange={(o) => !o && setValueDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update value — {valueDialog?.name}</DialogTitle>
            <DialogDescription>Records today's value as a snapshot and updates the account.</DialogDescription>
          </DialogHeader>
          <Input type="number" value={valueInput} onChange={(e) => setValueInput(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setValueDialog(null)}>Cancel</Button>
            <Button onClick={() => valueDialog && recordSnapshot(valueDialog, Number(valueInput))}>Save snapshot</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function KPI({ title, value, sub, change, changeAbs, icon, accent }: { title: string; value: string; sub?: string; change?: number; changeAbs?: number; icon?: React.ReactNode; accent?: boolean }) {
  const positive = (change ?? 0) >= 0;
  return (
    <Card className={`p-5 ${accent ? "border-primary/30 bg-primary/5" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
        {icon}
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {change !== undefined && (
        <p className={`text-xs mt-1 ${positive ? "text-success" : "text-destructive"}`}>
          {positive ? "+" : ""}{change.toFixed(2)}% MoM {changeAbs !== undefined && `(${positive ? "+" : ""}${fmt(changeAbs)})`}
        </p>
      )}
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </Card>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="py-12 text-center text-sm text-muted-foreground">{text}</div>;
}

export default NetWorth;