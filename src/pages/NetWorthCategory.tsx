import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { usePortfolios } from "@/hooks/usePortfolios";
import { supabase } from "@/integrations/supabase/client";
import { useNetWorthTotal } from "@/hooks/useNetWorthTotal";
import {
  ArrowLeft, Plus, Pencil, Trash2, Banknote, Briefcase, PiggyBank, Bitcoin,
  Home as HomeIcon, Car, Watch, Building2, Boxes, CreditCard, Search, Calculator, Info,
} from "lucide-react";
import { computeAmortization, estimateCapitalGainsTax, normalizeCountry, type CountryCode } from "@/lib/taxAmortization";

type CategoryKey =
  | "cash" | "investments" | "retirement" | "crypto"
  | "real_estate" | "vehicles" | "collectibles" | "private_equity"
  | "other_assets" | "liabilities";

interface FieldDef { key: string; label: string; type?: "text" | "number" | "date" | "textarea" | "select"; options?: string[]; placeholder?: string; }

const CATEGORY_META: Record<CategoryKey, { label: string; icon: any; color: string; description: string; fields: FieldDef[] }> = {
  cash: {
    label: "Cash & Equivalents", icon: Banknote, color: "hsl(142 70% 45%)",
    description: "Checking, savings, money market funds, short-term T-bills. Add one account per bank/product.",
    fields: [
      { key: "institution", label: "Institution / Bank", placeholder: "e.g. Revolut, Intesa Sanpaolo" },
      { key: "account_number_last4", label: "Last 4 digits (optional)", placeholder: "1234" },
      { key: "interest_rate", label: "Interest rate (%)", type: "number" },
      { key: "account_type", label: "Type", type: "select", options: ["Checking", "Savings", "Money market", "CD / Term deposit", "T-bill"] },
    ],
  },
  investments: {
    label: "Investments", icon: Briefcase, color: "hsl(199 89% 48%)",
    description: "Brokerage accounts, stocks, ETFs, bonds. Link a Vela portfolio for live valuation, or track manually.",
    fields: [
      { key: "institution", label: "Broker / Platform", placeholder: "e.g. Interactive Brokers, Directa" },
      { key: "account_type", label: "Account type", type: "select", options: ["Taxable brokerage", "ISA", "PEA", "PIR", "Tax-deferred"] },
      { key: "strategy", label: "Strategy / mandate", placeholder: "e.g. Growth, Value, Index 60/40" },
    ],
  },
  retirement: {
    label: "Retirement / Pension", icon: PiggyBank, color: "hsl(262 83% 58%)",
    description: "401k, IRA, fondi pensione, second pillar. Long-term, often tax-advantaged.",
    fields: [
      { key: "plan_type", label: "Plan type", type: "select", options: ["401k", "Traditional IRA", "Roth IRA", "Fondo pensione (Italy)", "2nd Pillar (CH)", "3rd Pillar (CH)", "SIPP (UK)", "Other"] },
      { key: "provider", label: "Provider", placeholder: "e.g. Vanguard, Allianz" },
      { key: "employer_match_pct", label: "Employer match (%)", type: "number" },
      { key: "annual_contribution", label: "Annual contribution", type: "number" },
      { key: "expected_payout_age", label: "Expected payout age", type: "number" },
    ],
  },
  crypto: {
    label: "Crypto", icon: Bitcoin, color: "hsl(38 92% 50%)",
    description: "Wallets, exchanges, staked assets. Link a crypto-only Vela portfolio for live valuation.",
    fields: [
      { key: "wallet_type", label: "Wallet type", type: "select", options: ["Exchange (custodial)", "Hot wallet", "Cold wallet (hardware)", "Staked", "DeFi protocol"] },
      { key: "platform", label: "Exchange / Platform", placeholder: "e.g. Coinbase, Ledger, Binance" },
      { key: "primary_asset", label: "Primary asset", placeholder: "BTC, ETH, …" },
    ],
  },
  real_estate: {
    label: "Real Estate", icon: HomeIcon, color: "hsl(173 70% 40%)",
    description: "Primary residence, rentals, land. Track market value, mortgage and rental income.",
    fields: [
      { key: "address", label: "Address", placeholder: "Street, city" },
      { key: "property_type", label: "Property type", type: "select", options: ["Primary residence", "Second home", "Rental", "Land", "Commercial"] },
      { key: "square_meters", label: "Size (m²)", type: "number" },
      { key: "year_built", label: "Year built", type: "number" },
      { key: "mortgage_balance", label: "Mortgage balance outstanding", type: "number" },
      { key: "monthly_rent", label: "Monthly rental income", type: "number" },
      { key: "monthly_expenses", label: "Monthly expenses (HOA, tax, maintenance)", type: "number" },
    ],
  },
  vehicles: {
    label: "Vehicles", icon: Car, color: "hsl(217 60% 55%)",
    description: "Cars, motorcycles, boats. Track depreciating assets and outstanding loans.",
    fields: [
      { key: "vehicle_type", label: "Type", type: "select", options: ["Car", "Motorcycle", "Boat", "RV", "Other"] },
      { key: "make", label: "Make", placeholder: "e.g. BMW" },
      { key: "model", label: "Model", placeholder: "e.g. M3 Competition" },
      { key: "year", label: "Year", type: "number" },
      { key: "vin", label: "VIN / Plate (optional)" },
      { key: "mileage_km", label: "Mileage (km)", type: "number" },
      { key: "loan_balance", label: "Loan balance outstanding", type: "number" },
    ],
  },
  collectibles: {
    label: "Watches & Collectibles", icon: Watch, color: "hsl(340 70% 55%)",
    description: "Watches, art, wine, jewelry, sneakers, trading cards. Track appreciating assets.",
    fields: [
      { key: "collectible_type", label: "Type", type: "select", options: ["Watch", "Art", "Wine", "Jewelry", "Sneakers", "Trading cards", "Sculpture", "Other"] },
      { key: "brand", label: "Brand / Artist", placeholder: "Rolex, Banksy, …" },
      { key: "model", label: "Model / Title", placeholder: "Submariner Date" },
      { key: "reference", label: "Reference / Serial", placeholder: "126610LN" },
      { key: "year", label: "Year", type: "number" },
      { key: "condition", label: "Condition", type: "select", options: ["Mint / NOS", "Excellent", "Very good", "Good", "Fair"] },
      { key: "papers", label: "Box & papers?", type: "select", options: ["Full set", "Watch only", "Papers only", "Unknown"] },
      { key: "appraisal_source", label: "Appraisal source (Chrono24, WatchCharts, gallery…)" },
    ],
  },
  private_equity: {
    label: "Private Equity / Business", icon: Building2, color: "hsl(280 60% 55%)",
    description: "Stakes in your own business, startups, partnerships. Often illiquid.",
    fields: [
      { key: "entity_name", label: "Entity name" },
      { key: "stake_pct", label: "Ownership stake (%)", type: "number" },
      { key: "round", label: "Last round", type: "select", options: ["Pre-seed", "Seed", "Series A", "Series B+", "Bootstrapped", "N/A"] },
      { key: "last_valuation", label: "Last valuation (post-money)", type: "number" },
      { key: "valuation_date", label: "Valuation date", type: "date" },
    ],
  },
  other_assets: {
    label: "Other Assets", icon: Boxes, color: "hsl(45 70% 50%)",
    description: "Loans you've made, intellectual property, royalties, anything else of value.",
    fields: [
      { key: "asset_type", label: "Asset type", placeholder: "e.g. Loan receivable, IP, Royalty" },
      { key: "counterparty", label: "Counterparty" },
      { key: "expected_recovery_date", label: "Expected recovery / maturity", type: "date" },
    ],
  },
  liabilities: {
    label: "Liabilities", icon: CreditCard, color: "hsl(0 75% 55%)",
    description: "Mortgages, personal loans, credit cards, student debt. Subtracted from total net worth.",
    fields: [
      { key: "debt_type", label: "Type", type: "select", options: ["Mortgage", "Personal loan", "Auto loan", "Credit card", "Student loan", "Margin loan", "Tax debt", "Other"] },
      { key: "lender", label: "Lender" },
      { key: "interest_rate", label: "Interest rate (%)", type: "number" },
      { key: "monthly_payment", label: "Monthly payment", type: "number" },
      { key: "maturity_date", label: "Maturity date", type: "date" },
    ],
  },
};

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
  details: Record<string, any>;
  purchase_date: string | null;
  purchase_price: number | null;
  quantity: number;
}

const fmt = (n: number, ccy = "EUR") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(n || 0);

function TaxAmortPanel({
  category, country, purchasePrice, purchaseDate, currentValue, currency,
}: { category: string; country: CountryCode; purchasePrice: number; purchaseDate: string; currentValue: number; currency: string }) {
  const amort = computeAmortization({ category, country, purchasePrice, purchaseDate });
  const holdingYears = Math.max(0, (Date.now() - new Date(purchaseDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
  const cgt = estimateCapitalGainsTax({ category, country, purchasePrice, currentValue, holdingYears });

  if (!amort && !cgt) return null;

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Calculator className="h-3 w-3" /> Tax & amortization · {country}
      </div>
      {amort && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <div className="flex justify-between"><span className="text-muted-foreground">Annual depreciation</span><span className="font-medium">{fmt(amort.schedule.annualDepreciation, currency)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Accumulated</span><span className="font-medium">{fmt(amort.schedule.accumulatedDepreciation, currency)}</span></div>
          <div className="flex justify-between col-span-2"><span className="text-muted-foreground">Book value (fiscal)</span><span className="font-semibold">{fmt(amort.schedule.bookValue, currency)} <span className="text-muted-foreground">({holdingYears.toFixed(1)}y)</span></span></div>
        </div>
      )}
      {cgt && cgt.gain !== 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <div className="flex justify-between"><span className="text-muted-foreground">If sold today, gain</span><span className={cgt.gain >= 0 ? "text-success font-medium" : "text-destructive font-medium"}>{fmt(cgt.gain, currency)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Tax ({(cgt.rateApplied * 100).toFixed(1)}%)</span><span className="font-medium">{fmt(cgt.taxOwed, currency)}</span></div>
          <div className="flex justify-between col-span-2"><span className="text-muted-foreground">Net proceeds</span><span className="font-semibold">{fmt(cgt.netProceeds, currency)}</span></div>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground italic leading-snug">{amort?.rule.note || cgt?.rationale}</p>
    </div>
  );
}

export default function NetWorthCategory() {
  const { category } = useParams<{ category: CategoryKey }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { portfolios } = usePortfolios();

  const meta = category ? CATEGORY_META[category] : undefined;
  const [accounts, setAccounts] = useState<NWAccount[]>([]);
  const [editing, setEditing] = useState<Partial<NWAccount> | null>(null);
  const [taxResidency, setTaxResidency] = useState<CountryCode>("OTHER");

  // FX-aware category subtotal in base currency (EUR), shared with dashboard/overview
  const fxTotals = useNetWorthTotal();

  // Symbol search (investments / crypto / retirement)
  const [symbolQuery, setSymbolQuery] = useState("");
  const [symbolResults, setSymbolResults] = useState<{ symbol: string; name: string; exchange: string; type: string; currency: string }[]>([]);
  const [symbolLoading, setSymbolLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("country_tax_residence").eq("user_id", user.id).maybeSingle();
      setTaxResidency(normalizeCountry(data?.country_tax_residence));
    })();
  }, [user]);

  useEffect(() => {
    if (!user || !category) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("net_worth_accounts")
        .select("*")
        .eq("category", category)
        .order("created_at");
      setAccounts((data as NWAccount[]) || []);
    })();
  }, [user, category]);

  // Debounced symbol search
  useEffect(() => {
    const q = symbolQuery.trim();
    if (q.length < 2) { setSymbolResults([]); return; }
    setSymbolLoading(true);
    const t = setTimeout(async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/symbol-search?q=${encodeURIComponent(q)}`;
        const r = await fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } });
        const j = await r.json();
        setSymbolResults((j?.results ?? []).slice(0, 8));
      } catch { setSymbolResults([]); }
      finally { setSymbolLoading(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [symbolQuery]);

  if (!meta) return <div className="p-10">Unknown category. <Link to="/net-worth" className="text-primary underline">Back</Link></div>;

  const Icon = meta.icon;
  const subtotal = category === "liabilities"
    ? fxTotals.liabilities
    : (fxTotals.byCategory[category!] || 0);
  const supportsSymbolSearch = category === "investments" || category === "crypto" || category === "retirement";
  const supportsAmortization = ["real_estate", "vehicles", "collectibles", "private_equity"].includes(category!);

  const startFromSymbol = (s: { symbol: string; name: string; currency: string }) => {
    setSymbolQuery("");
    setSymbolResults([]);
    setEditing({
      ...blank(),
      name: `${s.name} (${s.symbol})`,
      subcategory: s.symbol,
      currency: s.currency || "EUR",
    });
  };

  const blank = (): Partial<NWAccount> => ({
    category, currency: "EUR", include_in_total: true, manual_value: 0,
    linked_portfolio_ids: [], details: {}, quantity: 1,
  });

  const save = async () => {
    if (!user || !editing || !editing.name) {
      toast({ title: "Name is required", variant: "destructive" }); return;
    }
    const payload: any = {
      user_id: user.id,
      name: editing.name,
      category,
      subcategory: editing.subcategory || null,
      currency: editing.currency || "EUR",
      notes: editing.notes || null,
      linked_portfolio_ids: editing.linked_portfolio_ids || [],
      manual_value: Number(editing.manual_value) || 0,
      is_liability: category === "liabilities",
      include_in_total: editing.include_in_total ?? true,
      details: editing.details || {},
      purchase_date: editing.purchase_date || null,
      purchase_price: editing.purchase_price ? Number(editing.purchase_price) : null,
      quantity: Number(editing.quantity) || 1,
    };
    if (editing.id) {
      await (supabase as any).from("net_worth_accounts").update(payload).eq("id", editing.id);
    } else {
      await (supabase as any).from("net_worth_accounts").insert(payload);
    }
    const { data } = await (supabase as any).from("net_worth_accounts").select("*").eq("category", category).order("created_at");
    setAccounts((data as NWAccount[]) || []);
    setEditing(null);
    toast({ title: editing.id ? "Updated" : "Added" });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    await (supabase as any).from("net_worth_accounts").delete().eq("id", id);
    setAccounts(accounts.filter((a) => a.id !== id));
  };

  const itemNoun = category === "liabilities" ? "liability"
    : category === "collectibles" ? "collectible"
    : category === "vehicles" ? "vehicle"
    : category === "other_assets" ? "asset"
    : meta.label.toLowerCase().replace(/ies$/, "y").replace(/s$/, "");

  const residencyFlag = ({ IT: "🇮🇹", US: "🇺🇸", UK: "🇬🇧", FR: "🇫🇷", DE: "🇩🇪", CH: "🇨🇭" } as Record<string, string>)[taxResidency] || "🌍";
  const monthChangePct = 0.4; // placeholder for now

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <SEO title={`${meta.label} — Net Worth — Vela.ai`} description={meta.description} path={`/net-worth/${category}`} />

      <div>
        <button onClick={() => navigate("/net-worth")} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Net Worth
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${meta.color}20` }}>
              <Icon className="h-5 w-5" style={{ color: meta.color }} />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{meta.label}</h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{meta.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/profile" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted">
              Residency: {taxResidency} {residencyFlag}
            </Link>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Search className="h-4 w-4" /> Refresh
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setEditing(blank())}>
              <Plus className="h-4 w-4" /> Add {itemNoun}
            </Button>
          </div>
        </div>
      </div>

      {/* KPI strip — Subtotal / Accounts / contextual stat */}
      <div className="bg-card border border-border rounded-2xl divide-x divide-border grid grid-cols-3 overflow-hidden">
        <div className="p-5 flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Subtotal</span>
          <div className={`text-2xl font-bold tracking-tight tabular-nums ${category === "liabilities" ? "text-destructive" : ""}`}>
            {category === "liabilities" && subtotal > 0 ? "−" : ""}{fmt(subtotal)}
          </div>
          <span className={`text-xs ${monthChangePct >= 0 ? "text-success" : "text-destructive"}`}>
            {monthChangePct >= 0 ? "+" : ""}{monthChangePct.toFixed(1)}% MoM
          </span>
        </div>
        <div className="p-5 flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{category === "liabilities" ? "Loans" : "Accounts"}</span>
          <div className="text-2xl font-bold tracking-tight tabular-nums">{accounts.length}</div>
        </div>
        <div className="p-5 flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {category === "cash" ? "Avg yield"
              : category === "liabilities" ? "Weighted APR"
              : category === "real_estate" ? "Rental yield"
              : category === "investments" ? "Live value"
              : category === "crypto" ? "Volatility"
              : "Diversification"}
          </span>
          <div className="text-2xl font-bold tracking-tight tabular-nums">
            {category === "cash" ? "2.1%" : category === "liabilities" ? "2.9%" : "—"}
          </div>
        </div>
      </div>

        {/* Symbol search for investment-style categories */}
        {supportsSymbolSearch && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Search instruments to add</h3>
              <span className="text-[11px] text-muted-foreground">stocks, ETFs, bonds, crypto worldwide</span>
            </div>
            <Input
              placeholder={category === "crypto" ? "Search e.g. BTC, ETH, Solana…" : "Search e.g. ENI, Apple, iShares Core MSCI World…"}
              value={symbolQuery}
              onChange={(e) => setSymbolQuery(e.target.value)}
            />
            {symbolLoading && <p className="text-xs text-muted-foreground mt-2">Searching…</p>}
            {symbolResults.length > 0 && (
              <div className="mt-3 divide-y divide-border rounded-md border border-border max-h-72 overflow-y-auto">
                {symbolResults.map((r) => (
                  <button
                    key={r.symbol}
                    onClick={() => startFromSymbol(r)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.name}</p>
                      <p className="text-[11px] text-muted-foreground">{r.symbol} · {r.exchange} · {r.type}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0">{r.currency}</Badge>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-2">
              Or skip search and <button className="underline" onClick={() => setEditing(blank())}>add manually</button>.
            </p>
          </Card>
        )}

      {/* Accounts table (mockup pattern: single white card with header + Export, then table) */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between border-b border-border">
          <h2 className="font-semibold">{meta.label} ({accounts.length})</h2>
          <Button variant="outline" size="sm" className="gap-1.5">
            <span className="text-base leading-none">⤓</span> Export
          </Button>
        </div>

        {accounts.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <Icon className="h-10 w-10 mx-auto mb-3 opacity-40" style={{ color: meta.color }} />
            <h3 className="font-semibold mb-1">No {meta.label.toLowerCase()} yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Add your first entry to start tracking.</p>
            <Button onClick={() => setEditing(blank())} size="sm"><Plus className="h-4 w-4" /> Add now</Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/30">
                <th className="px-5 py-3">{category === "liabilities" ? "Liability" : "Account"}</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">{category === "liabilities" ? "Balance" : "Currency"}</th>
                <th className="px-3 py-3 text-right">{category === "liabilities" ? "Rate" : "Balance"}</th>
                <th className="px-3 py-3 text-right">{category === "liabilities" ? "Term" : "Δ 30d"}</th>
                <th className="px-3 py-3 text-right">{category === "liabilities" ? "Payment" : "Δ %"}</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {accounts.map((a) => {
                const v = Number(a.manual_value) || 0;
                const typeLabel = a.subcategory
                  || (a.details?.account_type as string)
                  || (a.details?.property_type as string)
                  || (a.details?.vehicle_type as string)
                  || (a.details?.collectible_type as string)
                  || (a.details?.debt_type as string)
                  || "—";
                const gain = a.purchase_price ? v - Number(a.purchase_price) : 0;
                const gainPct = a.purchase_price ? (gain / Number(a.purchase_price)) * 100 : 0;
                return (
                  <tr key={a.id} className={`hover:bg-muted/30 transition-colors ${!a.include_in_total ? "opacity-50" : ""}`}>
                    <td className="px-5 py-4">
                      <div className="font-medium">{a.name}</div>
                      {a.notes && <div className="text-xs text-muted-foreground truncate max-w-xs">{a.notes}</div>}
                    </td>
                    <td className="px-3 py-4 text-muted-foreground">{typeLabel}</td>
                    {category === "liabilities" ? (
                      <>
                        <td className="px-3 py-4 tabular-nums">{fmt(v, a.currency)}</td>
                        <td className="px-3 py-4 text-right tabular-nums">{a.details?.interest_rate != null ? `${a.details.interest_rate}%` : "—"}</td>
                        <td className="px-3 py-4 text-right tabular-nums text-xs text-muted-foreground">{a.details?.maturity_date || "—"}</td>
                        <td className="px-3 py-4 text-right tabular-nums">{a.details?.monthly_payment ? `${fmt(a.details.monthly_payment, a.currency)}/mo` : "—"}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-4 text-muted-foreground">{a.currency}</td>
                        <td className="px-3 py-4 text-right tabular-nums font-medium">{fmt(v, a.currency)}</td>
                        <td className={`px-3 py-4 text-right tabular-nums ${gain >= 0 ? "text-success" : "text-destructive"}`}>
                          {a.purchase_price ? `${gain >= 0 ? "+" : ""}${fmt(gain, a.currency)}` : "—"}
                        </td>
                        <td className={`px-3 py-4 text-right tabular-nums ${gain >= 0 ? "text-success" : "text-destructive"}`}>
                          {a.purchase_price ? `${gain >= 0 ? "+" : ""}${gainPct.toFixed(1)}%` : "—"}
                        </td>
                      </>
                    )}
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(a)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(a.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* Tax & amortization details inline for assets with cost basis */}
      {(supportsAmortization || ["investments", "crypto"].includes(category!)) && accounts.some((a) => a.purchase_price && a.purchase_date) && (
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
            <Calculator className="h-4 w-4" /> Tax & amortization · {taxResidency}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accounts.filter((a) => a.purchase_price && a.purchase_date).map((a) => (
              <div key={a.id} className="border border-border rounded-lg p-3">
                <p className="font-medium text-sm mb-1">{a.name}</p>
                <TaxAmortPanel
                  category={category!}
                  country={taxResidency}
                  purchasePrice={Number(a.purchase_price)}
                  purchaseDate={a.purchase_date!}
                  currentValue={Number(a.manual_value)}
                  currency={a.currency}
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? `Edit ${meta.label.toLowerCase()}` : `Add ${meta.label.toLowerCase()}`}</DialogTitle>
            <DialogDescription>{meta.description}</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Name *</Label>
                  <Input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder={category === "real_estate" ? "Milan apartment" : category === "vehicles" ? "BMW M3" : category === "collectibles" ? "Rolex Submariner" : "Account name"} />
                </div>
                <div>
                  <Label>Current value *</Label>
                  <Input type="number" value={editing.manual_value ?? 0} onChange={(e) => setEditing({ ...editing, manual_value: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select value={editing.currency || "EUR"} onValueChange={(v) => setEditing({ ...editing, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["EUR","USD","GBP","CHF","JPY"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              {(category === "investments" || category === "crypto" || category === "retirement") && portfolios.length > 0 && (
                <div className="rounded-md border border-border p-3 space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide">Link Vela portfolios (live value)</Label>
                  {portfolios.map((p) => {
                    const checked = (editing.linked_portfolio_ids || []).includes(p.id);
                    return (
                      <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={checked} onCheckedChange={(c) => {
                          const cur = editing.linked_portfolio_ids || [];
                          setEditing({ ...editing, linked_portfolio_ids: c ? [...cur, p.id] : cur.filter((x) => x !== p.id) });
                        }} />
                        <span>{p.name}</span>
                      </label>
                    );
                  })}
                  <p className="text-[11px] text-muted-foreground">When linked, the main Net Worth view computes value live from holdings.</p>
                </div>
              )}

              <div>
                <h4 className="text-sm font-semibold mb-2">Details</h4>
                <div className="grid grid-cols-2 gap-3">
                  {meta.fields.map((f) => (
                    <div key={f.key} className={f.type === "textarea" ? "col-span-2" : ""}>
                      <Label>{f.label}</Label>
                      {f.type === "select" ? (
                        <Select value={editing.details?.[f.key] || ""} onValueChange={(v) => setEditing({ ...editing, details: { ...(editing.details || {}), [f.key]: v } })}>
                          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                          <SelectContent>{f.options!.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : f.type === "textarea" ? (
                        <Textarea rows={2} value={editing.details?.[f.key] || ""} onChange={(e) => setEditing({ ...editing, details: { ...(editing.details || {}), [f.key]: e.target.value } })} />
                      ) : (
                        <Input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                          placeholder={f.placeholder}
                          value={editing.details?.[f.key] ?? ""}
                          onChange={(e) => setEditing({ ...editing, details: { ...(editing.details || {}), [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value } })} />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Cost basis (optional)</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Purchase price</Label>
                    <Input type="number" value={editing.purchase_price ?? ""} onChange={(e) => setEditing({ ...editing, purchase_price: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                  <div>
                    <Label>Purchase date</Label>
                    <Input type="date" value={editing.purchase_date || ""} onChange={(e) => setEditing({ ...editing, purchase_date: e.target.value })} />
                  </div>
                  <div>
                    <Label>Quantity</Label>
                    <Input type="number" value={editing.quantity ?? 1} onChange={(e) => setEditing({ ...editing, quantity: Number(e.target.value) })} />
                  </div>
                </div>
              </div>

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
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}