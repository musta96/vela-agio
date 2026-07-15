import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useBaseCurrency } from "@/hooks/useBaseCurrency";
import { supabase } from "@/integrations/supabase/client";
import { ArrowDownRight, ArrowUpRight, Plus, Trash2, Wallet, Pencil, Pause, Play, Target, TrendingUp, AlertTriangle } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  ComposedChart,
  ReferenceLine,
} from "recharts";
import { useNetWorthTotal } from "@/hooks/useNetWorthTotal";

/**
 * Monthly cash flow tracker — records income and expense entries and
 * surfaces monthly totals, savings rate, category mix and 12-month trend.
 *
 * Data lives in `public.cash_flow_entries` with RLS scoped to auth.uid().
 * `recurring_monthly` entries are projected forward from their entry_date
 * into every subsequent month so users don't have to re-enter fixed bills.
 */

type CashFlowEntry = {
  id: string;
  user_id: string;
  entry_date: string; // YYYY-MM-DD
  direction: "income" | "expense";
  category: string;
  label: string | null;
  amount: number;
  currency: string;
  recurring_monthly: boolean;
  notes: string | null;
  paused_from: string | null; // YYYY-MM-DD; recurring stops projecting from this date onward
};

type BudgetTarget = {
  id: string;
  user_id: string;
  category: string;
  monthly_limit: number;
  currency: string;
};

const INCOME_CATEGORIES = ["Salary", "Freelance", "Dividends", "Interest", "Rental", "Bonus", "Other"];
const EXPENSE_CATEGORIES = [
  "Housing",
  "Food",
  "Transport",
  "Utilities",
  "Insurance",
  "Healthcare",
  "Subscriptions",
  "Debt payments",
  "Leisure",
  "Travel",
  "Education",
  "Taxes",
  "Other",
];

const PIE_COLORS = [
  "hsl(199 89% 48%)",
  "hsl(142 70% 45%)",
  "hsl(38 92% 50%)",
  "hsl(262 83% 58%)",
  "hsl(173 70% 40%)",
  "hsl(340 70% 55%)",
  "hsl(280 60% 55%)",
  "hsl(45 70% 50%)",
  "hsl(217 60% 55%)",
  "hsl(0 75% 55%)",
  "hsl(160 60% 45%)",
  "hsl(30 80% 55%)",
  "hsl(210 40% 50%)",
];

const fmt = (n: number, ccy = "EUR") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(n || 0);

function monthKey(iso: string) {
  return iso.slice(0, 7);
}
function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function monthLabel(mk: string) {
  const [y, m] = mk.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString("en-US", { month: "short", year: "2-digit" });
}

export function CashFlowPanel() {
  const { user } = useAuth();
  const { baseCurrency } = useBaseCurrency();
  const ccy = (baseCurrency || "EUR").toUpperCase();
  const { toast } = useToast();
  const netWorth = useNetWorthTotal();

  const [entries, setEntries] = useState<CashFlowEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [budgets, setBudgets] = useState<BudgetTarget[]>([]);
  const [editing, setEditing] = useState<CashFlowEntry | null>(null);
  const [budgetDialog, setBudgetDialog] = useState<{ category: string; amount: string } | null>(null);
  const [forecastMonths, setForecastMonths] = useState<12 | 24 | 60>(24);

  // New-entry form state
  const [direction, setDirection] = useState<"income" | "expense">("expense");
  const [category, setCategory] = useState<string>("Housing");
  const [label, setLabel] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [entryDate, setEntryDate] = useState<string>(todayIso());
  const [recurring, setRecurring] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [entriesRes, budgetsRes] = await Promise.all([
      (supabase as any).from("cash_flow_entries").select("*").order("entry_date", { ascending: false }).limit(500),
      (supabase as any).from("budget_targets").select("*"),
    ]);
    if (!entriesRes.error && entriesRes.data) setEntries(entriesRes.data as CashFlowEntry[]);
    if (!budgetsRes.error && budgetsRes.data) setBudgets(budgetsRes.data as BudgetTarget[]);
    setLoading(false);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Reset category when direction switches so we never keep an income
  // category selected while adding an expense (or vice versa).
  useEffect(() => {
    setCategory(direction === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
  }, [direction]);

  const addEntry = async () => {
    if (!user) return;
    const amt = Number(amount);
    if (!isFinite(amt) || amt <= 0) {
      return toast({ title: "Enter a positive amount", variant: "destructive" });
    }
    setSaving(true);
    const { error } = await (supabase as any).from("cash_flow_entries").insert({
      user_id: user.id,
      entry_date: entryDate,
      direction,
      category,
      label: label.trim() || null,
      amount: amt,
      currency: ccy,
      recurring_monthly: recurring,
    });
    setSaving(false);
    if (error) return toast({ title: "Could not save entry", description: error.message, variant: "destructive" });
    toast({ title: `${direction === "income" ? "Income" : "Expense"} recorded` });
    setAmount("");
    setLabel("");
    setRecurring(false);
    void load();
  };

  const removeEntry = async (id: string) => {
    if (!confirm("Delete this cash flow entry?")) return;
    const { error } = await (supabase as any).from("cash_flow_entries").delete().eq("id", id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const updateEntry = async (patch: Partial<CashFlowEntry> & { id: string }) => {
    const { id, ...rest } = patch;
    const { error } = await (supabase as any).from("cash_flow_entries").update(rest).eq("id", id);
    if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
    toast({ title: "Entry updated" });
    setEditing(null);
    void load();
  };

  const togglePause = async (e: CashFlowEntry) => {
    if (!e.recurring_monthly) return;
    const nextPause = e.paused_from ? null : new Date().toISOString().slice(0, 10);
    const { error } = await (supabase as any)
      .from("cash_flow_entries")
      .update({ paused_from: nextPause })
      .eq("id", e.id);
    if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
    toast({ title: nextPause ? "Recurring paused" : "Recurring resumed" });
    void load();
  };

  const saveBudget = async () => {
    if (!user || !budgetDialog) return;
    const amt = Number(budgetDialog.amount);
    if (!isFinite(amt) || amt < 0) {
      return toast({ title: "Enter a valid limit", variant: "destructive" });
    }
    const { error } = await (supabase as any).from("budget_targets").upsert(
      { user_id: user.id, category: budgetDialog.category, monthly_limit: amt, currency: ccy },
      { onConflict: "user_id,category" },
    );
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: "Budget target saved" });
    setBudgetDialog(null);
    void load();
  };

  const removeBudget = async (id: string) => {
    const { error } = await (supabase as any).from("budget_targets").delete().eq("id", id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    setBudgets((prev) => prev.filter((b) => b.id !== id));
  };

  // ---- Aggregations ------------------------------------------------------
  // Project each entry into every month from its entry_date up to "now" when
  // recurring_monthly is on, otherwise the single entry month. A recurring
  // entry with `paused_from` set stops projecting from that month onward
  // (past months already elapsed remain).
  const projected = useMemo(() => {
    const nowKey = currentMonthKey();
    const rows: { month: string; direction: "income" | "expense"; category: string; amount: number }[] = [];
    for (const e of entries) {
      const startKey = monthKey(e.entry_date);
      if (!e.recurring_monthly) {
        rows.push({ month: startKey, direction: e.direction, category: e.category, amount: Number(e.amount) || 0 });
        continue;
      }
      const pausedKey = e.paused_from ? monthKey(e.paused_from) : null;
      // Walk months from start → now
      const [sy, sm] = startKey.split("-").map(Number);
      const [ny, nm] = nowKey.split("-").map(Number);
      let y = sy;
      let m = sm;
      while (y < ny || (y === ny && m <= nm)) {
        const mk = `${y}-${String(m).padStart(2, "0")}`;
        if (pausedKey && mk >= pausedKey) break;
        rows.push({ month: mk, direction: e.direction, category: e.category, amount: Number(e.amount) || 0 });
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
      }
    }
    return rows;
  }, [entries]);

  const monthlySeries = useMemo(() => {
    // Build last 12 months (chronological)
    const map = new Map<string, { income: number; expense: number }>();
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(mk, { income: 0, expense: 0 });
    }
    for (const r of projected) {
      if (!map.has(r.month)) continue;
      const slot = map.get(r.month)!;
      slot[r.direction] += r.amount;
    }
    let running = 0;
    return Array.from(map.entries()).map(([mk, v]) => {
      const net = v.income - v.expense;
      running += net;
      return {
        month: monthLabel(mk),
        rawMonth: mk,
        income: Math.round(v.income),
        expense: Math.round(v.expense),
        net: Math.round(net),
        cumulative: Math.round(running),
      };
    });
  }, [projected]);

  const thisMonthKey = currentMonthKey();
  const thisMonth = useMemo(() => {
    const income = projected.filter((r) => r.month === thisMonthKey && r.direction === "income").reduce((a, b) => a + b.amount, 0);
    const expense = projected.filter((r) => r.month === thisMonthKey && r.direction === "expense").reduce((a, b) => a + b.amount, 0);
    return { income, expense, net: income - expense };
  }, [projected, thisMonthKey]);

  const savingsRate = thisMonth.income > 0 ? (thisMonth.net / thisMonth.income) * 100 : 0;

  // 12-month averages (trailing)
  const trailing = useMemo(() => {
    const income = monthlySeries.reduce((a, b) => a + b.income, 0);
    const expense = monthlySeries.reduce((a, b) => a + b.expense, 0);
    return { income: income / 12, expense: expense / 12, net: (income - expense) / 12 };
  }, [monthlySeries]);

  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of projected) {
      if (r.direction !== "expense" || r.month !== thisMonthKey) continue;
      map.set(r.category, (map.get(r.category) || 0) + r.amount);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  }, [projected, thisMonthKey]);

  // ---- Budget targets: progress vs this month, over-limit alerts ---------
  const budgetRows = useMemo(() => {
    const spendByCat = new Map<string, number>();
    for (const r of projected) {
      if (r.direction !== "expense" || r.month !== thisMonthKey) continue;
      spendByCat.set(r.category, (spendByCat.get(r.category) || 0) + r.amount);
    }
    return budgets
      .map((b) => {
        const spent = spendByCat.get(b.category) || 0;
        const limit = Number(b.monthly_limit) || 0;
        const pct = limit > 0 ? (spent / limit) * 100 : 0;
        return { ...b, spent, pct, over: limit > 0 && spent > limit };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [budgets, projected, thisMonthKey]);

  const overBudget = budgetRows.filter((r) => r.over);

  // ---- Net worth growth forecast ----------------------------------------
  // Baseline = current net worth (FX-converted, shared with dashboard).
  // Monthly delta = sum of ACTIVE recurring income - active recurring expenses
  // (a stable, forward-looking estimate). Historical net cash flow drives the
  // "past" side so users see the join between recorded history and forecast.
  const forecastSeries = useMemo(() => {
    const baseline = netWorth.total || 0;
    const now = new Date();
    const rows: { label: string; forecast: number | null; history: number | null; rawMonth: string }[] = [];

    // Past 12 months, built from recorded cumulative cash flow (reversed) so
    // the chart connects to today's baseline.
    const monthlyNet = monthlySeries.map((m) => m.net);
    const totalHistoryDelta = monthlyNet.reduce((a, b) => a + b, 0);
    let running = baseline - totalHistoryDelta;
    for (let i = 0; i < monthlySeries.length; i++) {
      running += monthlyNet[i];
      rows.push({
        label: monthlySeries[i].month,
        rawMonth: monthlySeries[i].rawMonth,
        history: Math.round(running),
        forecast: i === monthlySeries.length - 1 ? Math.round(running) : null,
      });
    }

    // Budget map for capping recurring expenses per category.
    const budgetMap = new Map<string, number>();
    for (const b of budgets) {
      const lim = Number(b.monthly_limit) || 0;
      if (lim > 0) budgetMap.set(b.category, lim);
    }

    // Compute per-month projected delta, incorporating:
    //   • active recurring entries (expenses capped by budget target per category)
    //   • one-time future-dated entries (scheduled inflows/outflows)
    const perMonthDelta = (mk: string) => {
      const [yy, mm] = mk.split("-").map(Number);
      const monthDate = new Date(yy, mm - 1, 1);
      let income = 0;
      const expenseByCat = new Map<string, number>();
      let oneOff = 0;
      for (const e of entries) {
        const startKey = monthKey(e.entry_date);
        if (e.recurring_monthly) {
          if (mk < startKey) continue;
          if (e.paused_from && mk >= monthKey(e.paused_from)) continue;
          const amt = Number(e.amount) || 0;
          if (e.direction === "income") income += amt;
          else expenseByCat.set(e.category, (expenseByCat.get(e.category) || 0) + amt);
        } else {
          // Only include one-time entries that fall in the future month.
          if (startKey !== mk) continue;
          if (monthDate <= new Date(now.getFullYear(), now.getMonth(), 1)) continue;
          const amt = Number(e.amount) || 0;
          oneOff += e.direction === "income" ? amt : -amt;
        }
      }
      // Apply budget caps: recurring expenses in a budgeted category
      // cannot exceed the monthly limit (assumes user will stay within budget).
      let expense = 0;
      for (const [cat, amt] of expenseByCat) {
        const cap = budgetMap.get(cat);
        expense += cap != null ? Math.min(amt, cap) : amt;
      }
      return income - expense + oneOff;
    };

    let future = baseline;
    let firstMonthDelta = 0;
    for (let i = 1; i <= forecastMonths; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const delta = perMonthDelta(mk);
      if (i === 1) firstMonthDelta = delta;
      future += delta;
      rows.push({
        label: d.toLocaleString("en-US", { month: "short", year: "2-digit" }),
        rawMonth: mk,
        history: null,
        forecast: Math.round(future),
      });
    }
    return { rows, monthlyDelta: firstMonthDelta, baseline };
  }, [entries, netWorth.total, monthlySeries, forecastMonths]);

  const kpiCard = (label: string, value: string, hint?: string, tone?: "good" | "bad" | "muted") => (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={`text-2xl font-semibold mt-1 tabular-nums ${
          tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : ""
        }`}
      >
        {value}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </Card>
  );

  return (
    <div className="p-5 space-y-5">
      {/* Over-budget banner */}
      {overBudget.length > 0 && (
        <Card className="p-3 border-destructive/40 bg-destructive/5 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-semibold text-destructive">Over budget this month</div>
            <div className="text-xs text-muted-foreground">
              {overBudget
                .map((b) => `${b.category} (${fmt(b.spent, ccy)} / ${fmt(Number(b.monthly_limit), ccy)})`)
                .join(" · ")}
            </div>
          </div>
        </Card>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpiCard("Income this month", fmt(thisMonth.income, ccy), `12-mo avg ${fmt(trailing.income, ccy)}`, "good")}
        {kpiCard("Expenses this month", fmt(thisMonth.expense, ccy), `12-mo avg ${fmt(trailing.expense, ccy)}`, "bad")}
        {kpiCard(
          "Net cash flow",
          fmt(thisMonth.net, ccy),
          `12-mo avg ${fmt(trailing.net, ccy)}`,
          thisMonth.net >= 0 ? "good" : "bad",
        )}
        {kpiCard(
          "Savings rate",
          thisMonth.income > 0 ? `${savingsRate.toFixed(1)}%` : "—",
          "Net ÷ income",
          savingsRate >= 20 ? "good" : savingsRate >= 0 ? "muted" : "bad",
        )}
      </div>

      {/* Add form */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Add cash flow entry</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="col-span-2 md:col-span-1">
            <Label className="text-xs">Type</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as "income" | "expense")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 md:col-span-1">
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(direction === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 md:col-span-1">
            <Label className="text-xs">Amount ({ccy})</Label>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="col-span-2 md:col-span-1">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </div>
          <div className="col-span-2 md:col-span-1">
            <Label className="text-xs">Note (optional)</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Rent, Employer" maxLength={80} />
          </div>
          <div className="col-span-2 md:col-span-1 flex items-end gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={recurring} onCheckedChange={setRecurring} id="recurring" />
              <Label htmlFor="recurring" className="text-xs cursor-pointer">Repeats monthly</Label>
            </div>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={addEntry} disabled={saving} className="gap-2">
            <Plus className="h-4 w-4" /> {saving ? "Saving…" : "Add entry"}
          </Button>
        </div>
      </Card>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-2">Income vs expenses — last 12 months</h3>
          {monthlySeries.every((m) => m.income === 0 && m.expense === 0) ? (
            <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
              Add income and expenses above to see your monthly trend.
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <RTooltip
                    formatter={(v: any) => fmt(Number(v), ccy)}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  />
                  <Legend />
                  <Bar dataKey="income" name="Income" fill="hsl(142 70% 45%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Expenses" fill="hsl(0 75% 55%)" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="cumulative" name="Cumulative net" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">Expense mix — this month</h3>
          {expenseByCategory.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
              No expenses recorded this month.
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expenseByCategory} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {expenseByCategory.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RTooltip
                    formatter={(v: any, n: any) => [fmt(Number(v), ccy), String(n)]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Budget targets */}
      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Budget targets</h3>
            <span className="text-xs text-muted-foreground hidden sm:inline">Monthly spending limits per category</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setBudgetDialog({
                category: EXPENSE_CATEGORIES.find((c) => !budgets.some((b) => b.category === c)) ?? EXPENSE_CATEGORIES[0],
                amount: "",
              })
            }
          >
            <Plus className="h-4 w-4" /> Add target
          </Button>
        </div>
        {budgetRows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No budget targets yet. Add one to get alerted when a category exceeds its monthly limit.
          </div>
        ) : (
          <div className="p-4 grid gap-3 md:grid-cols-2">
            {budgetRows.map((b) => (
              <div key={b.id} className="border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">{b.category}</div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setBudgetDialog({ category: b.category, amount: String(b.monthly_limit) })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeBudget(b.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <Progress value={Math.min(100, b.pct)} className={b.over ? "[&>*]:bg-destructive" : ""} />
                <div className="flex items-center justify-between mt-1.5 text-xs">
                  <span className={b.over ? "text-destructive font-medium" : "text-muted-foreground"}>
                    {fmt(b.spent, ccy)} of {fmt(Number(b.monthly_limit), ccy)}
                  </span>
                  <span className={b.over ? "text-destructive font-medium" : "text-muted-foreground"}>
                    {b.pct.toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Net worth growth forecast */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Net worth forecast</h3>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Projected from current net worth + active recurring cash flow
            </span>
          </div>
          <div className="inline-flex items-center rounded-lg border border-border bg-card p-1 text-xs">
            {([12, 24, 60] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setForecastMonths(m)}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  forecastMonths === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === 60 ? "5Y" : `${m / 12}Y`}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Baseline today</div>
            <div className="text-lg font-semibold tabular-nums">{fmt(forecastSeries.baseline, ccy)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Monthly delta</div>
            <div className={`text-lg font-semibold tabular-nums ${forecastSeries.monthlyDelta >= 0 ? "text-success" : "text-destructive"}`}>
              {forecastSeries.monthlyDelta >= 0 ? "+" : ""}
              {fmt(forecastSeries.monthlyDelta, ccy)}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Projected in {forecastMonths === 60 ? "5y" : `${forecastMonths / 12}y`}</div>
            <div className="text-lg font-semibold tabular-nums">
              {fmt(forecastSeries.baseline + forecastSeries.monthlyDelta * forecastMonths, ccy)}
            </div>
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={forecastSeries.rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} interval="preserveStartEnd" />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <RTooltip
                formatter={(v: any, n: any) => [v == null ? "—" : fmt(Number(v), ccy), n === "forecast" ? "Forecast" : "Recorded"]}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              />
              <ReferenceLine
                x={forecastSeries.rows.find((r) => r.history !== null && r.forecast !== null)?.label}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="3 3"
                label={{ value: "Today", position: "top", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
              <Line type="monotone" dataKey="history" name="Recorded" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="forecast" name="Forecast" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Recent entries */}
      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Recent entries</h3>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No entries yet — add your first above.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.slice(0, 50).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="tabular-nums text-xs">{e.entry_date}</TableCell>
                    <TableCell>
                      {e.direction === "income" ? (
                        <Badge variant="outline" className="gap-1 text-success border-success/30">
                          <ArrowUpRight className="h-3 w-3" /> Income
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-destructive border-destructive/30">
                          <ArrowDownRight className="h-3 w-3" /> Expense
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.category}
                      {e.recurring_monthly && (
                        e.paused_from ? (
                          <Badge variant="outline" className="ml-2 text-[10px]">Paused</Badge>
                        ) : (
                          <Badge variant="secondary" className="ml-2 text-[10px]">Monthly</Badge>
                        )
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-[180px]">{e.label || "—"}</TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${e.direction === "income" ? "text-success" : "text-destructive"}`}>
                      {e.direction === "expense" ? "−" : "+"}
                      {fmt(Number(e.amount), e.currency || ccy)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        {e.recurring_monthly && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => togglePause(e)}
                            title={e.paused_from ? "Resume recurring" : "Pause recurring"}
                          >
                            {e.paused_from ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => setEditing(e)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => removeEntry(e.id)} title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Edit entry dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit cash flow entry</DialogTitle>
            <DialogDescription>Update the entry details. Recurring entries will re-project future months automatically.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={editing.direction} onValueChange={(v) => setEditing({ ...editing, direction: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">Income</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Category</Label>
                  <Select value={editing.category} onValueChange={(v) => setEditing({ ...editing, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(editing.direction === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Amount ({editing.currency || ccy})</Label>
                  <Input
                    inputMode="decimal"
                    value={String(editing.amount)}
                    onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={editing.entry_date} onChange={(e) => setEditing({ ...editing, entry_date: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Note</Label>
                  <Input value={editing.label ?? ""} onChange={(e) => setEditing({ ...editing, label: e.target.value })} maxLength={80} />
                </div>
              </div>
              <div className="flex items-center gap-4 pt-1">
                <div className="flex items-center gap-2">
                  <Switch
                    id="edit-recurring"
                    checked={!!editing.recurring_monthly}
                    onCheckedChange={(v) => setEditing({ ...editing, recurring_monthly: v })}
                  />
                  <Label htmlFor="edit-recurring" className="text-xs cursor-pointer">Repeats monthly</Label>
                </div>
                {editing.recurring_monthly && (
                  <div className="flex items-center gap-2">
                    <Switch
                      id="edit-paused"
                      checked={!!editing.paused_from}
                      onCheckedChange={(v) =>
                        setEditing({ ...editing, paused_from: v ? new Date().toISOString().slice(0, 10) : null })
                      }
                    />
                    <Label htmlFor="edit-paused" className="text-xs cursor-pointer">Pause future months</Label>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              onClick={() =>
                editing &&
                updateEntry({
                  id: editing.id,
                  direction: editing.direction,
                  category: editing.category,
                  amount: Number(editing.amount) || 0,
                  entry_date: editing.entry_date,
                  label: editing.label?.trim() || null,
                  recurring_monthly: editing.recurring_monthly,
                  paused_from: editing.recurring_monthly ? editing.paused_from ?? null : null,
                })
              }
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Budget target dialog */}
      <Dialog open={!!budgetDialog} onOpenChange={(o) => !o && setBudgetDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set budget target</DialogTitle>
            <DialogDescription>
              Monthly limit for a spending category. Alerts show above when this month's spend exceeds it.
            </DialogDescription>
          </DialogHeader>
          {budgetDialog && (
            <div className="grid gap-3">
              <div>
                <Label className="text-xs">Category</Label>
                <Select
                  value={budgetDialog.category}
                  onValueChange={(v) => setBudgetDialog({ ...budgetDialog, category: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Monthly limit ({ccy})</Label>
                <Input
                  inputMode="decimal"
                  value={budgetDialog.amount}
                  onChange={(e) => setBudgetDialog({ ...budgetDialog, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBudgetDialog(null)}>Cancel</Button>
            <Button onClick={saveBudget}>Save target</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}