import { useEffect, useMemo, useRef, useState } from "react";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useBaseCurrency } from "@/hooks/useBaseCurrency";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv } from "@/lib/csvUtil";
import {
  AlertTriangle, ArrowLeftRight, Download, PiggyBank, Plus, Trash2, Upload, Wallet,
  Repeat, GitMerge, CheckCircle2, XCircle, Link2,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer,
  Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";

/**
 * Budget vs Actual Spending Dashboard
 * -----------------------------------
 * Reads from the existing `budget_targets` and `cash_flow_entries` tables
 * (both RLS-scoped to `auth.uid()`) so no migration is needed:
 *   • Users pick a month, and each category shows target vs actual with a
 *     bar-chart comparison and inline over-budget alerts.
 *   • Budget targets can be created/edited/deleted directly from the page.
 *   • Bank transactions can be imported from any CSV export (Mint, Revolut,
 *     N26, generic bank exports) with column mapping; imports insert
 *     `expense` cash-flow entries which then flow into the "actual" column.
 */

const EXPENSE_CATEGORIES = [
  "Housing", "Food", "Transport", "Utilities", "Insurance", "Healthcare",
  "Subscriptions", "Debt payments", "Leisure", "Travel", "Education", "Taxes", "Other",
];

type BudgetTarget = { id: string; category: string; monthly_limit: number; currency: string };
type CashFlowEntry = {
  id: string; entry_date: string; direction: "income" | "expense";
  category: string; label: string | null; amount: number; currency: string;
};

/**
 * Recurring transaction rule (client-side, stored in localStorage).
 * When the selected month has no actual entry that matches the rule pattern,
 * an expected/projected amount is added into the "actual" column so future
 * months compare correctly against the budget.
 */
type RecurringRule = {
  id: string;
  label: string;
  pattern: string;          // case-insensitive substring/regex against label
  category: string;
  amount: number;
  day_of_month: number;     // 1..28
  active: boolean;
};

/**
 * Per-transaction reconciliation tag (client-side, localStorage).
 * - transfer: excluded from actuals (moves between own accounts)
 * - duplicate: excluded from actuals (dedupe of an imported row)
 * - matched: user-confirmed real expense
 */
type TxTag = "transfer" | "duplicate" | "matched";

const RULES_LS_KEY = (uid: string) => `vela.budget.recurring.rules.v1.${uid}`;
const TAGS_LS_KEY = (uid: string) => `vela.budget.tx.tags.v1.${uid}`;

function loadRules(uid: string): RecurringRule[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(RULES_LS_KEY(uid)) || "[]"); } catch { return []; }
}
function saveRules(uid: string, rules: RecurringRule[]) {
  try { window.localStorage.setItem(RULES_LS_KEY(uid), JSON.stringify(rules)); } catch { /* ignore */ }
}
function loadTags(uid: string): Record<string, TxTag> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(window.localStorage.getItem(TAGS_LS_KEY(uid)) || "{}"); } catch { return {}; }
}
function saveTags(uid: string, tags: Record<string, TxTag>) {
  try { window.localStorage.setItem(TAGS_LS_KEY(uid), JSON.stringify(tags)); } catch { /* ignore */ }
}

function matchesRule(rule: RecurringRule, label: string | null): boolean {
  if (!rule.pattern) return false;
  const l = (label || "").toLowerCase();
  const p = rule.pattern.toLowerCase();
  return l.includes(p);
}

const fmt = (n: number, ccy = "EUR") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(n || 0);

function monthKey(d: Date | string): string {
  const iso = typeof d === "string" ? d : d.toISOString();
  return iso.slice(0, 7);
}
function nowMonth(): string { return new Date().toISOString().slice(0, 7); }
function prevMonth(m: string, delta = 1): string {
  const [y, mm] = m.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mm - 1 - delta, 1));
  return dt.toISOString().slice(0, 7);
}
function monthOptions(count = 12): string[] {
  const out: string[] = [];
  const base = nowMonth();
  for (let i = 0; i < count; i++) out.push(prevMonth(base, -1 + i)); // include next month & 11 back
  return Array.from(new Set([nowMonth(), ...Array.from({ length: count }, (_, i) => prevMonth(nowMonth(), i))]))
    .sort()
    .reverse();
}

/** Very small CSV parser — handles quoted values with commas and doubled
 *  quotes. Sufficient for typical bank/Mint exports; not a full RFC-4180
 *  implementation. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur = ""; let row: string[] = []; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim().length > 0));
}

function guessColumn(headers: string[], candidates: string[]): number {
  const norm = headers.map((h) => h.trim().toLowerCase());
  for (const c of candidates) {
    const idx = norm.findIndex((h) => h === c || h.includes(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

export default function Budget() {
  const { user } = useAuth();
  const { baseCurrency } = useBaseCurrency();
  const ccy = (baseCurrency || "USD").toUpperCase();
  const { toast } = useToast();

  const [selectedMonth, setSelectedMonth] = useState<string>(nowMonth());
  const [targets, setTargets] = useState<BudgetTarget[]>([]);
  const [entries, setEntries] = useState<CashFlowEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [tags, setTags] = useState<Record<string, TxTag>>({});
  const [tab, setTab] = useState<string>("overview");

  // Load rules & tags whenever the user changes.
  useEffect(() => {
    if (!user) { setRules([]); setTags({}); return; }
    setRules(loadRules(user.id));
    setTags(loadTags(user.id));
  }, [user?.id]);

  const persistRules = (next: RecurringRule[]) => {
    setRules(next);
    if (user) saveRules(user.id, next);
  };
  const persistTags = (next: Record<string, TxTag>) => {
    setTags(next);
    if (user) saveTags(user.id, next);
  };

  const load = async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const [{ data: t }, { data: e }] = await Promise.all([
      (supabase as any).from("budget_targets").select("*").order("category"),
      (supabase as any).from("cash_flow_entries").select("*").eq("direction", "expense"),
    ]);
    setTargets(t ?? []);
    setEntries((e ?? []) as CashFlowEntry[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  // Entries excluded from budget totals: user-tagged transfers or duplicates.
  const isExcluded = (id: string) => {
    const t = tags[id];
    return t === "transfer" || t === "duplicate";
  };

  // Bucket actuals for the selected month by category.
  // Includes scheduled recurring rules for the current or future months when
  // no actual entry has already covered that rule this month.
  const isFutureOrCurrent = (() => {
    const [ny, nm] = nowMonth().split("-").map(Number);
    const [sy, sm] = selectedMonth.split("-").map(Number);
    return sy > ny || (sy === ny && sm >= nm);
  })();

  const monthEntries = useMemo(
    () => entries.filter((e) => monthKey(e.entry_date) === selectedMonth),
    [entries, selectedMonth],
  );

  const actualsByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of monthEntries) {
      if (isExcluded(e.id)) continue;
      map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount || 0));
    }
    // Layer in projected recurring rules for the current + future months.
    if (isFutureOrCurrent) {
      for (const r of rules) {
        if (!r.active) continue;
        // Skip rules already satisfied this month by a real entry.
        const satisfied = monthEntries.some((e) => !isExcluded(e.id) && matchesRule(r, e.label));
        if (satisfied) continue;
        map.set(r.category, (map.get(r.category) ?? 0) + Number(r.amount || 0));
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthEntries, rules, tags, isFutureOrCurrent]);

  // Projected-only slice, for transparency in the UI.
  const projectedByCategory = useMemo(() => {
    const map = new Map<string, number>();
    if (!isFutureOrCurrent) return map;
    for (const r of rules) {
      if (!r.active) continue;
      const satisfied = monthEntries.some((e) => !isExcluded(e.id) && matchesRule(r, e.label));
      if (satisfied) continue;
      map.set(r.category, (map.get(r.category) ?? 0) + Number(r.amount || 0));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, monthEntries, tags, isFutureOrCurrent]);

  const chartData = useMemo(() => {
    const cats = new Set<string>([...targets.map((t) => t.category), ...actualsByCategory.keys()]);
    return Array.from(cats).sort().map((cat) => {
      const target = targets.find((t) => t.category === cat)?.monthly_limit ?? 0;
      const actual = actualsByCategory.get(cat) ?? 0;
      const variance = actual - target;
      return { category: cat, target, actual, variance };
    });
  }, [targets, actualsByCategory]);

  const totals = useMemo(() => {
    const target = targets.reduce((a, t) => a + Number(t.monthly_limit || 0), 0);
    const actual = Array.from(actualsByCategory.values()).reduce((a, v) => a + v, 0);
    return { target, actual, remaining: target - actual, overspent: Math.max(0, actual - target) };
  }, [targets, actualsByCategory]);

  const overspent = chartData.filter((r) => r.target > 0 && r.actual > r.target);
  const uncategorised = chartData.filter((r) => r.target === 0 && r.actual > 0);

  // --- Target CRUD ---
  const upsertTarget = async (category: string, monthly_limit: number) => {
    if (!user) return;
    if (!Number.isFinite(monthly_limit) || monthly_limit < 0) return;
    const existing = targets.find((t) => t.category === category);
    const payload = existing
      ? { id: existing.id, category, monthly_limit, currency: ccy, user_id: user.id }
      : { category, monthly_limit, currency: ccy, user_id: user.id };
    const { error } = await (supabase as any).from("budget_targets").upsert(payload, { onConflict: "id" });
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Budget saved", description: `${category} · ${fmt(monthly_limit, ccy)} / mo` });
    load();
  };
  const removeTarget = async (id: string) => {
    const { error } = await (supabase as any).from("budget_targets").delete().eq("id", id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    setTargets((prev) => prev.filter((t) => t.id !== id));
  };

  // --- Export ---
  const exportComparison = () => {
    downloadCsv(`budget-vs-actual-${selectedMonth}.csv`, [
      ["Category", "Budget", "Actual", "Variance", "% Used"],
      ...chartData.map((r) => [
        r.category,
        r.target,
        r.actual,
        r.variance,
        r.target > 0 ? ((r.actual / r.target) * 100).toFixed(1) + "%" : "—",
      ]),
    ]);
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <SEO
        title="Budget vs Actual Spending — Import Bank Transactions"
        description="Import bank transactions, set monthly budgets per category, and see budget vs actual spending with over-budget alerts."
        path="/budget"
      />
      <PageHeader
        icon={PiggyBank}
        title="Budget vs Actual"
        description="Set monthly targets per category, import bank transactions, and see where every dollar goes."
        actions={
          <div className="flex items-center gap-2">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthOptions(13).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-2" /> Import CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportComparison}>
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
          </div>
        }
      />

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <Kpi label="Budget this month" value={fmt(totals.target, ccy)} icon={Wallet} />
        <Kpi label="Spent so far" value={fmt(totals.actual, ccy)} icon={ArrowLeftRight}
             tone={totals.actual > totals.target && totals.target > 0 ? "bad" : "neutral"} />
        <Kpi label={totals.remaining >= 0 ? "Remaining" : "Over budget"}
             value={fmt(Math.abs(totals.remaining), ccy)}
             tone={totals.remaining >= 0 ? "good" : "bad"} />
        <Kpi label="Overspent categories" value={String(overspent.length)}
             icon={AlertTriangle} tone={overspent.length > 0 ? "bad" : "good"} />
      </div>

      {(overspent.length > 0 || uncategorised.length > 0) && (
        <div className="space-y-2 mb-4">
          {overspent.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>You're over budget in {overspent.length} categor{overspent.length === 1 ? "y" : "ies"}</AlertTitle>
              <AlertDescription className="text-xs">
                {overspent.map((r) => `${r.category} (+${fmt(r.variance, ccy)})`).join(" · ")}
              </AlertDescription>
            </Alert>
          )}
          {uncategorised.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{uncategorised.length} categor{uncategorised.length === 1 ? "y" : "ies"} without a budget</AlertTitle>
              <AlertDescription className="text-xs">
                Set a monthly target for: {uncategorised.map((r) => r.category).join(", ")}.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {isFutureOrCurrent && projectedByCategory.size > 0 && (
        <Alert className="mb-4">
          <Repeat className="h-4 w-4" />
          <AlertTitle>Projected recurring transactions applied</AlertTitle>
          <AlertDescription className="text-xs">
            {Array.from(projectedByCategory.entries())
              .map(([c, v]) => `${c} (+${fmt(v, ccy)})`)
              .join(" · ")}
            {" — "}scheduled from your recurring rules because no matching import exists yet this month.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="recurring">
            Recurring rules {rules.length > 0 && <Badge variant="secondary" className="ml-2 h-4 text-[10px]">{rules.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="reconcile">Reconcile</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-0">
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Comparison chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Budget vs Actual — {selectedMonth}</CardTitle>
            <CardDescription>Bars compare your monthly target against actual spending for each category.</CardDescription>
          </CardHeader>
          <CardContent className="h-[420px]">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No budgets or transactions for this month yet. Import a CSV or add a target to get started.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="category" stroke="hsl(var(--muted-foreground))" fontSize={11}
                    angle={-25} textAnchor="end" height={60} interval={0} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11}
                    tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
                  <RTooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    formatter={(v: any, n: any) => [fmt(Number(v), ccy), n]}
                  />
                  <Legend />
                  <Bar dataKey="target" name="Budget" fill="hsl(199 89% 48%)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="actual" name="Actual" radius={[3, 3, 0, 0]}>
                    {chartData.map((r, i) => (
                      <Cell key={i} fill={r.target > 0 && r.actual > r.target ? "hsl(0 75% 55%)" : "hsl(142 70% 45%)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Budget targets editor */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Category budgets</CardTitle>
            <CardDescription>Monthly targets. Applied on the {selectedMonth} comparison.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <BudgetEditor
              targets={targets}
              ccy={ccy}
              onSave={upsertTarget}
              onDelete={removeTarget}
            />
          </CardContent>
        </Card>
      </div>

      {/* Per-category progress table */}
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Category breakdown</CardTitle>
          <CardDescription>How each category is trending against its monthly cap.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : chartData.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Nothing to show yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="w-[220px]">Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chartData.map((r) => {
                  const pct = r.target > 0 ? Math.min(100, (r.actual / r.target) * 100) : 0;
                  const over = r.target > 0 && r.actual > r.target;
                  return (
                    <TableRow key={r.category}>
                      <TableCell className="font-medium">{r.category}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.target > 0 ? fmt(r.target, ccy) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.actual, ccy)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.target > 0 ? (
                          <Badge variant={over ? "destructive" : "secondary"}>
                            {r.variance >= 0 ? "+" : ""}{fmt(r.variance, ccy)}
                          </Badge>
                        ) : <span className="text-muted-foreground text-xs">no target</span>}
                      </TableCell>
                      <TableCell>
                        {r.target > 0 ? (
                          <div className="space-y-1">
                            <Progress value={pct} className={over ? "[&>div]:bg-destructive" : ""} />
                            <div className="text-[10px] text-muted-foreground">{pct.toFixed(0)}% used</div>
                          </div>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="recurring" className="mt-0">
          <RecurringRulesPanel
            rules={rules}
            onChange={persistRules}
            ccy={ccy}
            selectedMonth={selectedMonth}
            monthEntries={monthEntries}
            isFutureOrCurrent={isFutureOrCurrent}
            isExcluded={isExcluded}
          />
        </TabsContent>

        <TabsContent value="reconcile" className="mt-0">
          <ReconcilePanel
            entries={entries}
            tags={tags}
            onChange={persistTags}
            ccy={ccy}
            selectedMonth={selectedMonth}
          />
        </TabsContent>
      </Tabs>

      <ImportCsvDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={load}
        currency={ccy}
      />

      <p className="text-xs text-muted-foreground mt-4">
        Imports create expense entries in your cash-flow ledger. You can review, edit, or delete individual
        transactions from the Net Worth &rarr; Cash Flow panel. Categories are normalised to the standard list.
      </p>
    </div>
  );
}

// ---------------- Budget editor ----------------
function BudgetEditor({
  targets, ccy, onSave, onDelete,
}: {
  targets: BudgetTarget[]; ccy: string;
  onSave: (category: string, limit: number) => void;
  onDelete: (id: string) => void;
}) {
  const [category, setCategory] = useState<string>("Housing");
  const [amount, setAmount] = useState<string>("");

  return (
    <div>
      <div className="p-3 grid grid-cols-[1fr_120px_auto] gap-2 border-b border-border items-end">
        <div className="space-y-1">
          <Label className="text-xs">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Monthly {ccy}</Label>
          <Input type="number" min={0} step={10} value={amount} className="h-8"
            onChange={(e) => setAmount(e.target.value)} placeholder="500" />
        </div>
        <Button size="sm" className="h-8" onClick={() => {
          const n = Number(amount);
          if (!Number.isFinite(n) || n <= 0) return;
          onSave(category, n);
          setAmount("");
        }}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="max-h-[340px] overflow-y-auto">
        {targets.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">No budgets yet. Add one above.</div>
        ) : (
          <Table>
            <TableBody>
              {targets.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.category}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      className="h-7 w-24 ml-auto text-right text-xs"
                      defaultValue={t.monthly_limit}
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n) && n !== t.monthly_limit && n >= 0) onSave(t.category, n);
                      }}
                    />
                  </TableCell>
                  <TableCell className="w-8 text-right">
                    <Button size="icon" variant="ghost" className="h-7 w-7"
                      onClick={() => onDelete(t.id)} aria-label={`Remove ${t.category} budget`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

// ---------------- CSV import dialog ----------------
type MappedRow = { entry_date: string; label: string; amount: number; category: string };

function ImportCsvDialog({
  open, onOpenChange, onImported, currency,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
  currency: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [dateCol, setDateCol] = useState<number>(-1);
  const [descCol, setDescCol] = useState<number>(-1);
  const [amountCol, setAmountCol] = useState<number>(-1);
  const [categoryCol, setCategoryCol] = useState<number>(-1);
  const [defaultCategory, setDefaultCategory] = useState<string>("Other");
  const [invertSign, setInvertSign] = useState<boolean>(false);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setHeaders([]); setRows([]); setDateCol(-1); setDescCol(-1);
    setAmountCol(-1); setCategoryCol(-1); setInvertSign(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) { toast({ title: "Empty CSV", variant: "destructive" }); return; }
    const [h, ...body] = parsed;
    setHeaders(h);
    setRows(body);
    setDateCol(guessColumn(h, ["date", "transaction date", "posted"]));
    setDescCol(guessColumn(h, ["description", "merchant", "payee", "narrative", "details", "memo"]));
    setAmountCol(guessColumn(h, ["amount", "value", "debit", "money out"]));
    setCategoryCol(guessColumn(h, ["category", "type"]));
  };

  const normaliseCategory = (raw: string): string => {
    if (!raw) return defaultCategory;
    const low = raw.toLowerCase();
    const hit = EXPENSE_CATEGORIES.find((c) => c.toLowerCase() === low || low.includes(c.toLowerCase()));
    if (hit) return hit;
    if (/rent|mortgage|home/.test(low)) return "Housing";
    if (/grocery|restaurant|coffee|dining|food/.test(low)) return "Food";
    if (/uber|lyft|gas|fuel|transit|train|bus/.test(low)) return "Transport";
    if (/electric|water|gas bill|internet|phone|utility/.test(low)) return "Utilities";
    if (/insurance/.test(low)) return "Insurance";
    if (/pharmacy|doctor|medical|health/.test(low)) return "Healthcare";
    if (/netflix|spotify|subscription/.test(low)) return "Subscriptions";
    if (/loan|credit card/.test(low)) return "Debt payments";
    if (/flight|hotel|airbnb|travel/.test(low)) return "Travel";
    if (/school|tuition|udemy|course/.test(low)) return "Education";
    if (/tax/.test(low)) return "Taxes";
    return defaultCategory;
  };

  const preview: MappedRow[] = useMemo(() => {
    if (dateCol < 0 || amountCol < 0) return [];
    return rows
      .map((r) => {
        const rawDate = (r[dateCol] || "").trim();
        const rawAmt = (r[amountCol] || "").trim();
        if (!rawDate || !rawAmt) return null;
        // Normalise date: accept YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY.
        let iso = rawDate;
        if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) iso = rawDate;
        else {
          const parts = rawDate.split(/[\/\.\-]/);
          if (parts.length === 3) {
            const [a, b, c] = parts;
            const yyyy = c.length === 4 ? c : (parseInt(c) > 50 ? `19${c}` : `20${c}`);
            // Assume DD/MM/YYYY if the first part > 12.
            if (parseInt(a) > 12) iso = `${yyyy}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
            else iso = `${yyyy}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
          }
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
        let amt = Number(rawAmt.replace(/[^\d\.\-]/g, ""));
        if (!Number.isFinite(amt)) return null;
        if (invertSign) amt = -amt;
        // Only import outflows (negative amounts) as expenses. Users often
        // export both directions; we skip income rows to keep the dashboard
        // focused on spending. Take absolute value for storage.
        if (amt >= 0) return null;
        const label = descCol >= 0 ? (r[descCol] || "").trim() : "";
        const rawCat = categoryCol >= 0 ? (r[categoryCol] || "").trim() : "";
        return {
          entry_date: iso,
          amount: Math.abs(amt),
          label,
          category: normaliseCategory(rawCat || label),
        } as MappedRow;
      })
      .filter(Boolean) as MappedRow[];
  }, [rows, dateCol, amountCol, descCol, categoryCol, invertSign, defaultCategory]);

  const doImport = async () => {
    if (!user) { toast({ title: "Sign in required", variant: "destructive" }); return; }
    if (preview.length === 0) { toast({ title: "Nothing to import", variant: "destructive" }); return; }
    setImporting(true);
    const payload = preview.map((r) => ({
      user_id: user.id,
      direction: "expense" as const,
      entry_date: r.entry_date,
      amount: r.amount,
      currency,
      category: r.category,
      label: r.label || null,
      recurring_monthly: false,
    }));
    const { error } = await (supabase as any).from("cash_flow_entries").insert(payload);
    setImporting(false);
    if (error) { toast({ title: "Import failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Imported", description: `${preview.length} transaction${preview.length === 1 ? "" : "s"} added.` });
    onOpenChange(false);
    reset();
    onImported();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import bank transactions</DialogTitle>
          <DialogDescription>
            Upload a CSV export from your bank (Mint, Revolut, N26, Chase, ...). Map the columns and we'll
            categorise and add each outflow to your cash-flow ledger.
          </DialogDescription>
        </DialogHeader>

        {headers.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center space-y-3">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Drag a CSV here or click to browse.</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>Choose file</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <ColSelect label="Date column" headers={headers} value={dateCol} onChange={setDateCol} />
              <ColSelect label="Amount column" headers={headers} value={amountCol} onChange={setAmountCol} />
              <ColSelect label="Description column" headers={headers} value={descCol} onChange={setDescCol} allowNone />
              <ColSelect label="Category column" headers={headers} value={categoryCol} onChange={setCategoryCol} allowNone />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Default category</Label>
                <Select value={defaultCategory} onValueChange={setDefaultCategory}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount convention</Label>
                <Select value={invertSign ? "positive-out" : "negative-out"} onValueChange={(v) => setInvertSign(v === "positive-out")}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="negative-out">Expenses are negative (default)</SelectItem>
                    <SelectItem value="positive-out">Expenses are positive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              {preview.length} of {rows.length} rows will be imported as expenses.
              Rows without a valid date, amount, or with positive (income) amounts are skipped.
            </div>

            <div className="max-h-64 overflow-y-auto border border-border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.slice(0, 50).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{r.entry_date}</TableCell>
                      <TableCell className="text-xs truncate max-w-[220px]">{r.label}</TableCell>
                      <TableCell className="text-xs"><Badge variant="secondary">{r.category}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{fmt(r.amount, currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {preview.length > 50 && (
                <div className="p-2 text-[11px] text-muted-foreground text-center">…and {preview.length - 50} more.</div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => { onOpenChange(false); reset(); }}>Cancel</Button>
          {headers.length > 0 && (
            <>
              <Button variant="outline" onClick={reset}>Change file</Button>
              <Button onClick={doImport} disabled={importing || preview.length === 0}>
                {importing ? "Importing…" : `Import ${preview.length}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ColSelect({
  label, headers, value, onChange, allowNone,
}: {
  label: string; headers: string[]; value: number;
  onChange: (n: number) => void; allowNone?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select column…" /></SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value="-1">— none —</SelectItem>}
          {headers.map((h, i) => <SelectItem key={i} value={String(i)}>{h || `col ${i + 1}`}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// ---------------- Recurring rules panel ----------------
function RecurringRulesPanel({
  rules, onChange, ccy, selectedMonth, monthEntries, isFutureOrCurrent, isExcluded,
}: {
  rules: RecurringRule[];
  onChange: (next: RecurringRule[]) => void;
  ccy: string;
  selectedMonth: string;
  monthEntries: CashFlowEntry[];
  isFutureOrCurrent: boolean;
  isExcluded: (id: string) => boolean;
}) {
  const [label, setLabel] = useState("");
  const [pattern, setPattern] = useState("");
  const [category, setCategory] = useState<string>("Subscriptions");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState<string>("1");

  const add = () => {
    const n = Number(amount);
    const d = Math.max(1, Math.min(28, Number(day) || 1));
    if (!label.trim() || !pattern.trim() || !Number.isFinite(n) || n <= 0) return;
    const next: RecurringRule = {
      id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
      label: label.trim(),
      pattern: pattern.trim(),
      category,
      amount: n,
      day_of_month: d,
      active: true,
    };
    onChange([...rules, next]);
    setLabel(""); setPattern(""); setAmount("");
  };

  const update = (id: string, patch: Partial<RecurringRule>) => {
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const remove = (id: string) => onChange(rules.filter((r) => r.id !== id));

  return (
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Add recurring rule</CardTitle>
          <CardDescription>
            Auto-schedule bills or subscriptions into future months so budget vs actual stays accurate before the transaction imports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Netflix" className="h-8" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Match imported transactions containing</Label>
            <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="netflix" className="h-8" />
            <p className="text-[11px] text-muted-foreground">Case-insensitive substring match against the transaction description.</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Day</Label>
              <Input type="number" min={1} max={28} value={day} onChange={(e) => setDay(e.target.value)} className="h-8" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Amount ({ccy})</Label>
            <Input type="number" min={0} step={0.5} value={amount} onChange={(e) => setAmount(e.target.value)} className="h-8" />
          </div>
          <Button size="sm" onClick={add} className="w-full">
            <Plus className="h-3.5 w-3.5 mr-1" /> Add rule
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Rules ({rules.length})</CardTitle>
          <CardDescription>
            {isFutureOrCurrent
              ? `For ${selectedMonth}, active rules add to actuals when no matching import is found.`
              : `Rules are only projected into the current & future months. Historical months use imports only.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {rules.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No recurring rules yet. Add one on the left.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Pattern</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Day</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => {
                  const satisfied = monthEntries.some((e) => !isExcluded(e.id) && matchesRule(r, e.label));
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Checkbox checked={r.active} onCheckedChange={(v) => update(r.id, { active: !!v })} />
                      </TableCell>
                      <TableCell className="font-medium text-xs">{r.label}</TableCell>
                      <TableCell className="text-xs font-mono">{r.pattern}</TableCell>
                      <TableCell className="text-xs">
                        <Select value={r.category} onValueChange={(v) => update(r.id, { category: v })}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center">
                        <Input type="number" min={1} max={28} value={r.day_of_month}
                          onChange={(e) => update(r.id, { day_of_month: Math.max(1, Math.min(28, Number(e.target.value) || 1)) })}
                          className="h-7 w-14 text-xs text-center mx-auto" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" min={0} step={0.5} value={r.amount}
                          onChange={(e) => update(r.id, { amount: Number(e.target.value) || 0 })}
                          className="h-7 w-24 text-xs text-right ml-auto" />
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {!r.active ? (
                          <Badge variant="outline">Paused</Badge>
                        ) : satisfied ? (
                          <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Matched</Badge>
                        ) : isFutureOrCurrent ? (
                          <Badge className="gap-1"><Repeat className="h-3 w-3" /> Projected</Badge>
                        ) : (
                          <Badge variant="outline">—</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(r.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------- Reconcile panel ----------------
/**
 * Detects likely duplicate imports (same abs amount within a small window +
 * near-identical label) and likely internal transfers (offsetting income /
 * expense entries within a few days). User confirms each match, and tagged
 * transactions are excluded from budget-vs-actual totals.
 */
function ReconcilePanel({
  entries, tags, onChange, ccy, selectedMonth,
}: {
  entries: CashFlowEntry[];
  tags: Record<string, TxTag>;
  onChange: (next: Record<string, TxTag>) => void;
  ccy: string;
  selectedMonth: string;
}) {
  const monthEntries = useMemo(
    () => entries.filter((e) => monthKey(e.entry_date) === selectedMonth),
    [entries, selectedMonth],
  );

  // Duplicate detection: for each pair of same-direction entries in the same
  // month with matching amount (rounded to 2dp) and Jaccard-ish label overlap
  // and dates within 3 days, treat the later row as the duplicate candidate.
  const duplicates = useMemo(() => {
    const out: Array<{ keep: CashFlowEntry; dup: CashFlowEntry; score: number }> = [];
    const norm = (s: string | null) => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
    for (let i = 0; i < monthEntries.length; i++) {
      for (let j = i + 1; j < monthEntries.length; j++) {
        const a = monthEntries[i], b = monthEntries[j];
        if (a.direction !== b.direction) continue;
        if (Math.round(Number(a.amount) * 100) !== Math.round(Number(b.amount) * 100)) continue;
        const days = Math.abs((new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime()) / 86400000);
        if (days > 3) continue;
        const wa = new Set(norm(a.label));
        const wb = new Set(norm(b.label));
        const inter = [...wa].filter((w) => wb.has(w)).length;
        const union = new Set([...wa, ...wb]).size || 1;
        const jacc = inter / union;
        if (jacc < 0.4 && (a.label || "") !== (b.label || "")) continue;
        const [keep, dup] = a.entry_date <= b.entry_date ? [a, b] : [b, a];
        out.push({ keep, dup, score: jacc });
      }
    }
    return out;
  }, [monthEntries]);

  // Transfer detection: matching abs amounts between an income and an expense
  // within 3 days (money leaving one account then landing in another).
  const transfers = useMemo(() => {
    const out: Array<{ out: CashFlowEntry; in: CashFlowEntry }> = [];
    const outs = monthEntries.filter((e) => e.direction === "expense");
    const ins = monthEntries.filter((e) => e.direction === "income");
    for (const o of outs) {
      for (const i of ins) {
        if (Math.round(Number(o.amount) * 100) !== Math.round(Number(i.amount) * 100)) continue;
        const days = Math.abs((new Date(o.entry_date).getTime() - new Date(i.entry_date).getTime()) / 86400000);
        if (days > 3) continue;
        out.push({ out: o, in: i });
      }
    }
    return out;
  }, [monthEntries]);

  const tagBoth = (ids: string[], tag: TxTag | undefined) => {
    const next = { ...tags };
    for (const id of ids) {
      if (tag) next[id] = tag;
      else delete next[id];
    }
    onChange(next);
  };

  const summary = useMemo(() => {
    let matched = 0, txr = 0, dup = 0, un = 0;
    for (const e of monthEntries) {
      const t = tags[e.id];
      if (t === "matched") matched++;
      else if (t === "transfer") txr++;
      else if (t === "duplicate") dup++;
      else un++;
    }
    return { matched, transfers: txr, duplicates: dup, unmatched: un };
  }, [monthEntries, tags]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Matched" value={String(summary.matched)} icon={CheckCircle2} tone="good" />
        <Kpi label="Unmatched" value={String(summary.unmatched)} icon={XCircle} tone={summary.unmatched > 0 ? "bad" : "neutral"} />
        <Kpi label="Transfers" value={String(summary.transfers)} icon={Link2} />
        <Kpi label="Duplicates" value={String(summary.duplicates)} icon={GitMerge} tone={summary.duplicates > 0 ? "bad" : "neutral"} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><GitMerge className="h-4 w-4" /> Suspected duplicates</CardTitle>
          <CardDescription>Pairs with matching amount and near-identical descriptions within 3 days.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {duplicates.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No duplicates detected for {selectedMonth}.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kept row</TableHead>
                  <TableHead>Duplicate row</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {duplicates.map(({ keep, dup }) => (
                  <TableRow key={`${keep.id}_${dup.id}`}>
                    <TableCell className="text-xs">
                      <div className="font-medium">{keep.label || keep.category}</div>
                      <div className="text-muted-foreground">{keep.entry_date} · {keep.category}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{dup.label || dup.category}</div>
                      <div className="text-muted-foreground">{dup.entry_date} · {dup.category}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{fmt(Number(dup.amount), ccy)}</TableCell>
                    <TableCell className="text-right">
                      {tags[dup.id] === "duplicate" ? (
                        <Button size="sm" variant="ghost" onClick={() => tagBoth([dup.id], undefined)}>Undo</Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => tagBoth([dup.id], "duplicate")}>
                          Mark duplicate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Link2 className="h-4 w-4" /> Suspected transfers</CardTitle>
          <CardDescription>Offsetting income/expense pairs within 3 days — likely movements between your own accounts.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {transfers.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No transfer pairs detected for {selectedMonth}.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Outflow</TableHead>
                  <TableHead>Inflow</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map(({ out: o, in: i }) => {
                  const tagged = tags[o.id] === "transfer" && tags[i.id] === "transfer";
                  return (
                    <TableRow key={`${o.id}_${i.id}`}>
                      <TableCell className="text-xs">
                        <div className="font-medium">{o.label || o.category}</div>
                        <div className="text-muted-foreground">{o.entry_date}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{i.label || i.category}</div>
                        <div className="text-muted-foreground">{i.entry_date}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{fmt(Number(o.amount), ccy)}</TableCell>
                      <TableCell className="text-right">
                        {tagged ? (
                          <Button size="sm" variant="ghost" onClick={() => tagBoth([o.id, i.id], undefined)}>Undo</Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => tagBoth([o.id, i.id], "transfer")}>
                            Confirm transfer
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">All transactions · {selectedMonth}</CardTitle>
          <CardDescription>Confirm expenses as matched, or reclassify individual rows.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {monthEntries.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No transactions for this month.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[200px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthEntries.slice(0, 200).map((e) => {
                  const t = tags[e.id];
                  return (
                    <TableRow key={e.id} className={t === "transfer" || t === "duplicate" ? "opacity-60" : ""}>
                      <TableCell className="text-xs">{e.entry_date}</TableCell>
                      <TableCell className="text-xs max-w-[240px] truncate">{e.label || "—"}</TableCell>
                      <TableCell className="text-xs"><Badge variant="secondary">{e.category}</Badge></TableCell>
                      <TableCell className={`text-right tabular-nums text-xs ${e.direction === "income" ? "text-success" : ""}`}>
                        {e.direction === "income" ? "+" : "−"}{fmt(Number(e.amount), ccy)}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={t ?? "unmatched"}
                          onValueChange={(v) => tagBoth([e.id], v === "unmatched" ? undefined : (v as TxTag))}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unmatched">Unmatched</SelectItem>
                            <SelectItem value="matched">Matched</SelectItem>
                            <SelectItem value="transfer">Transfer (exclude)</SelectItem>
                            <SelectItem value="duplicate">Duplicate (exclude)</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------- Small KPI card ----------------
function Kpi({
  label, value, icon: Icon, tone = "neutral",
}: {
  label: string; value: string; icon?: any; tone?: "good" | "bad" | "neutral";
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        {Icon && <Icon className={`h-4 w-4 ${tone === "bad" ? "text-destructive" : tone === "good" ? "text-success" : "text-muted-foreground"}`} />}
      </div>
      <div className={`text-2xl font-semibold mt-1 tabular-nums ${tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : ""}`}>
        {value}
      </div>
    </Card>
  );
}