import { useEffect, useState } from "react";
import { OwnerPageHeader } from "@/components/owner/OwnerLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Archive, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Env = "sandbox" | "live";
type StripeProduct = { id: string; name: string; description?: string | null; active: boolean; metadata?: Record<string,string> };
type StripePrice = { id: string; product: string; unit_amount: number; currency: string; active: boolean; recurring?: { interval: string } | null };

async function call(action: string, body: Record<string, unknown> = {}, env: Env = "sandbox") {
  const { data, error } = await supabase.functions.invoke("manage-plans", { body: { action, env, ...body } });
  if (error) throw new Error(error.message || "Request failed");
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

export default function OwnerPlans() {
  const [env, setEnv] = useState<Env>("sandbox");
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<StripeProduct[]>([]);
  const [prices, setPrices] = useState<StripePrice[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await call("list", {}, env);
      setProducts(r.products || []);
      setPrices(r.prices || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [env]);

  const createProduct = async () => {
    if (!newName.trim()) return;
    try {
      await call("create_product", { name: newName.trim(), description: newDesc.trim() || undefined }, env);
      toast.success("Product created");
      setNewName(""); setNewDesc(""); setCreating(false);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const archiveProduct = async (id: string) => {
    if (!confirm("Archive this plan? Existing subscribers keep access; new sign-ups won't see it.")) return;
    try { await call("update_product", { product_id: id, active: false }, env); toast.success("Archived"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const reactivate = async (id: string) => {
    try { await call("update_product", { product_id: id, active: true }, env); toast.success("Reactivated"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <>
      <OwnerPageHeader
        title="Plans & pricing"
        subtitle="Live data from billing provider - create products, add prices, archive plans"
        actions={
          <>
            <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
              <button onClick={() => setEnv("sandbox")} className={`px-3 h-9 ${env === "sandbox" ? "bg-foreground text-background" : "bg-card"}`}>Test</button>
              <button onClick={() => setEnv("live")} className={`px-3 h-9 ${env === "live" ? "bg-foreground text-background" : "bg-card"}`}>Live</button>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button size="sm" onClick={() => setCreating((v) => !v)}>
              <Plus className="h-4 w-4 mr-1.5" />New plan
            </Button>
          </>
        }
      />

      {creating && (
        <div className="rounded-2xl border border-border bg-card p-5 mb-6">
          <h3 className="text-sm font-semibold mb-3">New plan</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><Label className="text-xs">Name</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Pro" /></div>
            <div><Label className="text-xs">Description</Label><Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Full access" /></div>
          </div>
          <div className="mt-3 flex gap-2"><Button size="sm" onClick={createProduct}>Create</Button><Button size="sm" variant="outline" onClick={() => setCreating(false)}>Cancel</Button></div>
          <p className="text-[11px] text-muted-foreground mt-2">After creating the plan, add a price below.</p>
        </div>
      )}

      {loading && products.length === 0 ? (
        <div className="text-sm text-muted-foreground">Loading plans…</div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
          No products yet in {env}. Create one above.
        </div>
      ) : (
        <div className="space-y-4">
          {products.map((p) => {
            const pricesFor = prices.filter((pr) => pr.product === p.id);
            return (
              <PlanRow key={p.id} env={env} product={p} prices={pricesFor} onArchive={() => archiveProduct(p.id)} onReactivate={() => reactivate(p.id)} onChange={load} />
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mt-6">
        Prices are immutable in the billing provider - to change an amount, add a new price and archive the old one.
      </p>
    </>
  );
}

function PlanRow({ env, product, prices, onArchive, onReactivate, onChange }: {
  env: Env; product: StripeProduct; prices: StripePrice[];
  onArchive: () => void; onReactivate: () => void; onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("eur");
  const [interval, setInterval] = useState<"month" | "year" | "">("month");

  const addPrice = async () => {
    const cents = Math.round(Number(amount) * 100);
    if (!cents || cents < 0) { toast.error("Invalid amount"); return; }
    try {
      await call("create_price", { product_id: product.id, amount: cents, currency, interval: interval || undefined }, env);
      toast.success("Price added"); setAdding(false); setAmount(""); onChange();
    } catch (e: any) { toast.error(e.message); }
  };

  const archivePrice = async (id: string) => {
    try { await call("archive_price", { price_id: id }, env); toast.success("Price archived"); onChange(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className={`rounded-2xl border bg-card p-5 ${product.active ? "border-border" : "border-dashed opacity-70"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{product.name}</h3>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${product.active ? "bg-success/15 text-success" : "bg-foreground/10 text-muted-foreground"}`}>
              {product.active ? "ACTIVE" : "ARCHIVED"}
            </span>
          </div>
          {product.description && <p className="text-xs text-muted-foreground mt-1">{product.description}</p>}
          <p className="text-[10px] font-mono text-muted-foreground mt-1">{product.id}</p>
        </div>
        <div className="flex gap-2">
          {product.active
            ? <Button size="sm" variant="outline" onClick={onArchive}><Archive className="h-3.5 w-3.5 mr-1" />Archive</Button>
            : <Button size="sm" variant="outline" onClick={onReactivate}>Reactivate</Button>}
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">Prices</span>
          <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}><Plus className="h-3.5 w-3.5 mr-1" />Add price</Button>
        </div>
        {prices.length === 0 && !adding && <p className="text-xs text-muted-foreground">No prices yet - add one to make this plan purchasable.</p>}
        <div className="space-y-1.5">
          {prices.map((pr) => (
            <div key={pr.id} className="flex items-center justify-between text-sm border border-border rounded-lg px-3 py-2">
              <div>
                <span className="font-medium">{(pr.unit_amount / 100).toLocaleString(undefined, { style: "currency", currency: pr.currency.toUpperCase() })}</span>
                {pr.recurring ? <span className="text-muted-foreground"> / {pr.recurring.interval}</span> : <span className="text-muted-foreground"> · one-time</span>}
                {!pr.active && <span className="ml-2 text-[10px] uppercase text-muted-foreground">archived</span>}
                <span className="ml-2 font-mono text-[10px] text-muted-foreground">{pr.id}</span>
              </div>
              {pr.active && <Button size="sm" variant="ghost" onClick={() => archivePrice(pr.id)}>Archive</Button>}
            </div>
          ))}
        </div>
        {adding && (
          <div className="mt-3 grid sm:grid-cols-4 gap-2 items-end">
            <div><Label className="text-xs">Amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="49.00" /></div>
            <div><Label className="text-xs">Currency</Label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                <option value="eur">EUR</option><option value="usd">USD</option><option value="gbp">GBP</option>
              </select>
            </div>
            <div><Label className="text-xs">Billing</Label>
              <select value={interval} onChange={(e) => setInterval(e.target.value as any)} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                <option value="month">Monthly</option><option value="year">Yearly</option><option value="">One-time</option>
              </select>
            </div>
            <Button size="sm" onClick={addPrice}>Add</Button>
          </div>
        )}
      </div>
    </div>
  );
}