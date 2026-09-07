import { useEffect, useState } from "react";
import { Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePortfolios } from "@/hooks/usePortfolios";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  symbol: string;
  name?: string | null;
  price?: number | null;
  currency?: string | null;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "secondary";
  label?: string;
}

/**
 * One "Add to portfolio" flow for every instrument type (share, ETF, fund,
 * bond, crypto…). Lets the investor pick which portfolio to add to when they
 * keep more than one, and merges into an existing position at weighted cost.
 */
export const AddToPortfolioButton = ({
  symbol, name, price, currency, size = "sm", variant = "default", label = "Add to portfolio",
}: Props) => {
  const { user } = useAuth();
  const { portfolios, activeId, primaryId } = usePortfolios();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [portfolioId, setPortfolioId] = useState<string>("");
  const [shares, setShares] = useState("");
  const [avg, setAvg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShares("");
    setAvg(price ? String(Number(price).toFixed(4)) : "");
    setPortfolioId(activeId || primaryId || portfolios[0]?.id || "");
  }, [open, price, activeId, primaryId, portfolios]);

  const save = async () => {
    const sh = parseFloat(shares);
    const av = parseFloat(avg);
    if (!Number.isFinite(sh) || sh <= 0 || !Number.isFinite(av) || av <= 0) {
      toast({ title: "Check the numbers", description: "Quantity and average price must be greater than zero.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (user) {
        const { data: existing } = await supabase
          .from("portfolio_holdings")
          .select("id,shares,avg_price")
          .eq("user_id", user.id)
          .eq("symbol", symbol)
          .eq("portfolio_id", portfolioId)
          .maybeSingle();

        let newShares = sh, newAvg = av;
        if (existing) {
          const exS = Number(existing.shares), exA = Number(existing.avg_price);
          newShares = exS + sh;
          newAvg = (exS * exA + sh * av) / newShares;
          const { error } = await supabase.from("portfolio_holdings")
            .update({ shares: newShares, avg_price: newAvg, name: name ?? symbol, currency: currency ?? undefined })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("portfolio_holdings").insert({
            user_id: user.id, portfolio_id: portfolioId || null, symbol,
            name: name ?? symbol, shares: sh, avg_price: av, currency: currency ?? undefined,
          });
          if (error) throw error;
        }
      } else {
        const raw = localStorage.getItem("portfolio_holdings");
        const arr = raw ? JSON.parse(raw) : [];
        const idx = arr.findIndex((p: any) => p.symbol === symbol);
        if (idx >= 0) {
          const exS = Number(arr[idx].shares), exA = Number(arr[idx].avgPrice);
          const total = exS + sh;
          arr[idx] = { ...arr[idx], shares: total, avgPrice: (exS * exA + sh * av) / total };
        } else {
          arr.push({ symbol, name: name ?? symbol, shares: sh, avgPrice: av, currentPrice: price || av, currency });
        }
        localStorage.setItem("portfolio_holdings", JSON.stringify(arr));
      }
      const target = portfolios.find((p) => p.id === portfolioId)?.name;
      toast({ title: "Added", description: `${sh} ${symbol}${target ? ` in ${target}` : ""}.` });
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button size={size} variant={variant} className="gap-1.5" onClick={() => setOpen(true)}>
        <Briefcase className="h-4 w-4" /> {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add {symbol} to a portfolio</DialogTitle>
            <DialogDescription>
              If you already hold {symbol} there, the average price is recalculated automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {user && portfolios.length > 1 && (
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Portfolio</label>
                <Select value={portfolioId} onValueChange={setPortfolioId}>
                  <SelectTrigger><SelectValue placeholder="Choose a portfolio" /></SelectTrigger>
                  <SelectContent>
                    {portfolios.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}{p.is_simulation ? " (simulation)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Quantity</label>
              <Input type="number" inputMode="decimal" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">
                Average price{currency ? ` (${currency})` : ""}
              </label>
              <Input type="number" inputMode="decimal" value={avg} onChange={(e) => setAvg(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : label}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
