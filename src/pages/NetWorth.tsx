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
import { useNetWorthTotal } from "@/hooks/useNetWorthTotal";
import { CATEGORY_META as CATEGORIES, CATEGORY_ORDER, type CategoryKey } from "@/data/netWorthCategories";
import {
  Wallet, Banknote, Briefcase, Home as HomeIcon, Car, Watch, Building2, Bitcoin,
  PiggyBank, Boxes, CreditCard, Plus, Pencil, Trash2, TrendingUp, TrendingDown,
  Camera, RefreshCw,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, BarChart, Bar,
} from "recharts";


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

  // FX-aware totals (shared with Dashboard so the two numbers always agree)
  const fxTotals = useNetWorthTotal();

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
    const byCat: Record<CategoryKey, number> = Object.fromEntries(CATEGORY_ORDER.map((k) => [k, 0])) as any;
    for (const k of CATEGORY_ORDER) byCat[k] = fxTotals.byCategory[k] || 0;
    return { assets: fxTotals.assets, liabilities: fxTotals.liabilities, net: fxTotals.total, byCat };
    // eslint-disable-next-line
  }, [fxTotals.assets, fxTotals.liabilities, fxTotals.total, fxTotals.byCategory]);

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
    <div className="p-4 sm:p-8 space-y-6 min-w-0">
      <SEO title="Net Worth Tracker - Vela.ai" description="Track every asset and liability in one customisable dashboard." path="/net-worth" />
      <PageHeader
        icon={Wallet}
        title="Net Worth"
        description="A complete picture of what you own and what you owe - live-linked to your Vela portfolios."
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

        {/* KPI strip - single card with divided cells (mockup pattern) */}
        <div className="bg-card border border-border rounded-2xl divide-x divide-border grid grid-cols-2 lg:grid-cols-4 overflow-hidden">
          <div className="p-5 flex flex-col gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Net Worth</span>
            <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{fmt(totals.net)}</div>
            <span className={`text-xs tabular-nums ${monthChangePct >= 0 ? "text-success" : "text-destructive"}`}>
              ▲ {monthChangePct >= 0 ? "+" : ""}{monthChangePct.toFixed(1)}% MoM ({monthChange >= 0 ? "+" : "−"}{fmt(Math.abs(monthChange))})
            </span>
          </div>
          <div className="p-5 flex flex-col gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Assets</span>
            <div className="text-2xl font-bold tracking-tight tabular-nums">{fmt(totals.assets)}</div>
            <span className="text-xs text-success">▲ +0.9%</span>
          </div>
          <div className="p-5 flex flex-col gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Liabilities</span>
            <div className="text-2xl font-bold tracking-tight tabular-nums text-destructive">−{fmt(totals.liabilities)}</div>
            <span className="text-xs text-success">▼ −1.1% paid down</span>
          </div>
          <div className="p-5 flex flex-col gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Accounts</span>
            <div className="text-2xl font-bold tracking-tight tabular-nums">{accounts.length}</div>
            <span className="text-xs text-muted-foreground">{Object.values(grouped).filter((g) => g.length).length} categories</span>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-6 mt-4">
            {/* Chart + Allocation donut row (per mockup) */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Net worth over time</h3>
                  <div className="inline-flex items-center rounded-lg border border-border bg-card p-1 text-xs">
                    {["3M", "1Y", "3Y", "All"].map((p, i) => (
                      <button key={p} className={`px-3 py-1 rounded-md ${i === 1 ? "bg-foreground text-background" : "text-muted-foreground"}`}>{p}</button>
                    ))}
                  </div>
                </div>
                {history.length < 2 ? (
                  <EmptyHint text='Click "Snapshot today" each month to build your history.' />
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={history}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <RTooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                        <Line type="monotone" dataKey="net" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} fill="hsl(var(--primary) / 0.1)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Allocation</h3>
                  <span className="text-xs text-primary cursor-pointer">Open breakdown →</span>
                </div>
                {pieData.length === 0 ? (
                  <EmptyHint text="Add accounts to see your allocation." />
                ) : (
                  <>
                    <div className="relative h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2}>
                            {pieData.map((d) => <Cell key={d.key} fill={d.color} />)}
                          </Pie>
                          <RTooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total assets</span>
                        <span className="text-lg font-bold tabular-nums">{fmt(totals.assets)}</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">Net {fmt(totals.net)}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs mt-3">
                      {pieData.slice(0, 6).map((d) => (
                        <div key={d.key} className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                            <span className="truncate">{d.name}</span>
                          </span>
                          <span className="tabular-nums text-muted-foreground">{fmt(d.value)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Card>
            </div>

            {/* Category breakdown table (mockup pattern) */}
            <Card className="overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between border-b border-border">
                <h3 className="font-semibold">Category breakdown</h3>
                <div className="inline-flex items-center rounded-lg border border-border bg-card p-1 text-xs">
                  {["Overview", "Accounts", "History"].map((t, i) => (
                    <button key={t} className={`px-3 py-1 rounded-md ${i === 0 ? "bg-foreground text-background" : "text-muted-foreground"}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/30">
                    <th className="px-5 py-3">Category</th>
                    <th className="px-3 py-3">Accounts</th>
                    <th className="px-3 py-3 text-right">Value</th>
                    <th className="px-3 py-3 text-right">% of NW</th>
                    <th className="px-3 py-3">30-day trend</th>
                    <th className="px-3 py-3">MoM</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {CATEGORY_ORDER.map((k) => {
                    const list = grouped[k] || [];
                    const v = k === "liabilities" ? totals.liabilities : (totals.byCat[k] || 0);
                    // Asset categories show share of total assets; liabilities show
                    // share of total liabilities (rendered negative for clarity).
                    const denom = k === "liabilities" ? totals.liabilities : totals.assets;
                    const pct = denom > 0 ? (v / denom) * 100 * (k === "liabilities" ? -1 : 1) : 0;
                    const meta = CATEGORIES[k];
                    if (list.length === 0 && v === 0) return null;
                    const trend = pct > 1 ? "good" : pct < 0 ? "bad" : "muted";
                    return (
                      <tr key={k} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3 font-semibold">{meta.label}</td>
                        <td className="px-3 py-3 text-muted-foreground">{list.length === 0 ? "-" : list.map((a) => a.name).slice(0, 2).join(" + ")}</td>
                        <td className={`px-3 py-3 text-right tabular-nums ${k === "liabilities" ? "text-destructive" : ""}`}>
                          {k === "liabilities" && v > 0 ? "−" : ""}{fmt(v)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{pct.toFixed(1)}%</td>
                        <td className="px-3 py-3">
                          <svg width="80" height="20" viewBox="0 0 80 20"><path d="M0,12 L20,11 L40,10 L60,9 L80,8" stroke={meta.color} strokeWidth="1.5" fill="none" /></svg>
                        </td>
                        <td className={`px-3 py-3 text-xs font-medium ${trend === "good" ? "text-success" : trend === "bad" ? "text-destructive" : "text-muted-foreground"}`}>{trend}</td>
                        <td className="px-5 py-3 text-right">
                          <RLink to={`/net-worth/${k}`} className="text-primary text-xs hover:underline">View →</RLink>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="text-sm font-semibold mb-3">Assets vs Liabilities</h3>
              {history.length < 2 ? (
                <EmptyHint text='Click "Snapshot today" each month to build your history.' />
              ) : (
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                      <RTooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                      <Legend />
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
            {/* Category navigation grid - always visible so users see all categories and can drill in */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {CATEGORY_ORDER.map((k) => {
                const Icon = CATEGORIES[k].icon;
                const list = grouped[k] || [];
                // Use FX-converted single source of truth (same value as
                // dashboard tile + donut). NEVER sum raw account currencies.
                const subtotal = k === "liabilities" ? totals.liabilities : (totals.byCat[k] || 0);
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
              const subtotal = k === "liabilities" ? totals.liabilities : (totals.byCat[k] || 0);
              return (
                <Card key={k} className="overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-border flex-wrap" style={{ background: `${CATEGORIES[k].color}10` }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="h-4 w-4 shrink-0" style={{ color: CATEGORIES[k].color }} />
                      <h3 className="font-semibold truncate">{CATEGORIES[k].label}</h3>
                      <span className="text-xs text-muted-foreground hidden sm:inline">· {CATEGORIES[k].hint}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-semibold tabular-nums">{fmt(subtotal)}</div>
                      <Button asChild size="sm" variant="outline"><RLink to={`/net-worth/${k}`}>Open →</RLink></Button>
                    </div>
                  </div>
                  <div className="w-full overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="hidden sm:table-cell">Source</TableHead>
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
                              <div className="sm:hidden mt-1 text-xs text-muted-foreground">
                                {linked.length > 0 ? linked.join(", ") : "Manual"}
                              </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              {linked.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {linked.map((n, i) => <Badge key={i} variant="secondary" className="text-[10px]">{n}</Badge>)}
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
                  </div>
                </Card>
              );
            })}

            {accounts.length === 0 && !loading && (
              <Card className="p-10 text-center">
                <Wallet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-semibold mb-1">Start tracking your net worth</h3>
                <p className="text-sm text-muted-foreground mb-4">Add cash accounts, link your Vela portfolios, then add real estate, vehicles, watches - anything you own.</p>
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
                          {prev ? `${delta >= 0 ? "+" : ""}${fmt(delta)}` : "-"}
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
            <DialogTitle>Update value - {valueDialog?.name}</DialogTitle>
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