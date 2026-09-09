import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Plus, Rocket, Building2 } from "lucide-react";
import { CompanyFormDialog } from "@/components/company/CompanyFormDialog";
import { usePrivateCompanies, money, REGION_OF, STAGE_OPTIONS, type PrivateCompany } from "@/hooks/usePrivateCompanies";

function holdingValue(c: PrivateCompany): number {
  const own = Number(c.ownership_pct);
  const mark = Number(c.current_valuation);
  if (Number.isFinite(mark) && mark > 0) return Number.isFinite(own) && own > 0 ? mark * (own / 100) : mark;
  const post = Number(c.post_money);
  if (Number.isFinite(post) && Number.isFinite(own)) return post * (own / 100);
  return Number(c.amount_invested) || 0;
}

const stageLabel = (id: string) => STAGE_OPTIONS.find((s) => s.id === id)?.label ?? id;

/**
 * Startups and private companies shown next to the listed book, so the page
 * reports one total value, one return and one sector split across everything.
 */
export function PrivateHoldingsSection({ listedValue, listedCost }: { listedValue: number; listedCost: number }) {
  const startups = usePrivateCompanies("startup");
  const privates = usePrivateCompanies("private");
  const [open, setOpen] = useState(false);

  const items = useMemo(() => [...startups.items, ...privates.items], [startups.items, privates.items]);

  const stats = useMemo(() => {
    const invested = items.reduce((a, c) => a + (Number(c.amount_invested) || 0), 0);
    const value = items.reduce((a, c) => a + holdingValue(c), 0);
    const bySector = new Map<string, number>();
    const byRegion = new Map<string, number>();
    for (const c of items) {
      const s = c.sector || "Other";
      const g = REGION_OF[c.country] ?? c.country ?? "Unknown";
      bySector.set(s, (bySector.get(s) ?? 0) + holdingValue(c));
      byRegion.set(g, (byRegion.get(g) ?? 0) + holdingValue(c));
    }
    const totalValue = listedValue + value;
    const totalCost = listedCost + invested;
    return {
      invested,
      value,
      totalValue,
      totalCost,
      totalReturn: totalCost > 0 ? (totalValue - totalCost) / totalCost : null,
      privateShare: totalValue > 0 ? value / totalValue : 0,
      sectors: [...bySector.entries()].map(([label, v]) => ({ label, v, share: value > 0 ? v / value : 0 })).sort((a, b) => b.v - a.v),
      regions: [...byRegion.entries()].map(([label, v]) => ({ label, v, share: value > 0 ? v / value : 0 })).sort((a, b) => b.v - a.v),
    };
  }, [items, listedValue, listedCost]);

  return (
    <Card className="p-6 rounded-2xl mt-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Rocket className="h-4 w-4" />Startups &amp; private companies</h3>
          <p className="text-xs text-muted-foreground">Added to the totals below so one page covers shares, funds, ETFs and private holdings.</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Add startup</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total value (all holdings)</p>
          <p className="text-2xl font-bold">{money(stats.totalValue)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total cost basis</p>
          <p className="text-2xl font-bold">{money(stats.totalCost)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total return</p>
          <p className={`text-2xl font-bold ${stats.totalReturn == null ? "" : stats.totalReturn >= 0 ? "text-success" : "text-destructive"}`}>
            {stats.totalReturn == null ? "—" : `${(stats.totalReturn * 100).toFixed(1)}%`}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">In private holdings</p>
          <p className="text-2xl font-bold">{(stats.privateShare * 100).toFixed(0)}%</p>
          <Progress value={stats.privateShare * 100} className="h-1.5 mt-2" />
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No private holdings yet. Add a startup here, or open the{" "}
          <Link to="/startup-portfolio" className="text-primary hover:underline">startup portfolio</Link> for the full risk view.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {items.map((c) => {
              const v = holdingValue(c);
              const inv = Number(c.amount_invested) || 0;
              return (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {c.kind === "startup" ? <Rocket className="h-3.5 w-3.5 text-muted-foreground" /> : <Building2 className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className="font-medium text-sm truncate">{c.name}</span>
                    <Badge variant="secondary">{stageLabel(c.stage)}</Badge>
                    <span className="text-xs text-muted-foreground capitalize">{c.sector} · {c.country}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{money(v, c.currency)}</p>
                    <p className="text-xs text-muted-foreground">cost {money(inv, c.currency)}{inv > 0 ? ` · ${(v / inv).toFixed(2)}x` : ""}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {[["Private sector split", stats.sectors], ["Private geography split", stats.regions]].map(([title, rows]) => (
              <div key={title as string} className="space-y-2">
                <p className="text-xs font-semibold">{title as string}</p>
                {(rows as Array<{ label: string; v: number; share: number }>).map((r) => (
                  <div key={r.label} className="space-y-1">
                    <div className="flex justify-between text-xs"><span className="capitalize">{r.label}</span><span className="text-muted-foreground">{(r.share * 100).toFixed(0)}%</span></div>
                    <Progress value={r.share * 100} className="h-1.5" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      <CompanyFormDialog open={open} onOpenChange={setOpen} kind="startup" editing={null} onSubmit={async (draft) => { await startups.add(draft); }} />
    </Card>
  );
}
