import { useMemo, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Rocket, Pencil, Trash2, ExternalLink } from "lucide-react";
import { CompanyFormDialog } from "@/components/company/CompanyFormDialog";
import { StartupSentimentCard } from "@/components/valuation/StartupSentimentCard";
import { StartupRegistryCard } from "@/components/valuation/StartupRegistryCard";
import { StartupRiskCard } from "@/components/valuation/StartupRiskCard";
import { usePrivateCompanies, money, REGION_OF, STAGE_OPTIONS, type PrivateCompany } from "@/hooks/usePrivateCompanies";

const stageLabel = (id: string) => STAGE_OPTIONS.find((s) => s.id === id)?.label ?? id;

/** What the stake is worth today: an explicit mark, else our share of the last post-money. */
function holdingValue(c: PrivateCompany): number {
  const own = Number(c.ownership_pct);
  const mark = Number(c.current_valuation);
  if (Number.isFinite(mark) && mark > 0) return Number.isFinite(own) && own > 0 ? mark * (own / 100) : mark;
  const post = Number(c.post_money);
  if (Number.isFinite(post) && Number.isFinite(own)) return post * (own / 100);
  return Number(c.amount_invested) || 0;
}

/** The valuation method that carried the last saved run, if there is one. */
function methodOf(c: PrivateCompany): string {
  const v = c.last_valuation as Record<string, any> | null;
  const methods = v?.methods;
  if (Array.isArray(methods)) {
    const best = methods
      .filter((m: any) => m?.applicable && Number(m?.weight) > 0)
      .sort((a: any, b: any) => Number(b.weight) - Number(a.weight))[0];
    if (best?.label) return String(best.label);
  }
  if (Number(c.post_money) || Number(c.pre_money)) return "Last round price";
  return "Not valued yet";
}

export default function StartupPortfolio() {
  const { items, loading, add, update, remove } = usePrivateCompanies("startup");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PrivateCompany | null>(null);
  const [focus, setFocus] = useState<PrivateCompany | null>(null);

  const stats = useMemo(() => {
    const invested = items.reduce((a, c) => a + (Number(c.amount_invested) || 0), 0);
    const value = items.reduce((a, c) => a + holdingValue(c), 0);
    const bucket = (pick: (c: PrivateCompany) => string) => {
      const map = new Map<string, number>();
      for (const c of items) {
        const k = pick(c) || "Unknown";
        map.set(k, (map.get(k) ?? 0) + holdingValue(c));
      }
      return [...map.entries()]
        .map(([label, v]) => ({ label, value: v, share: value > 0 ? v / value : 0 }))
        .sort((a, b) => b.value - a.value);
    };

    const sectors = bucket((c) => c.sector);
    const geos = bucket((c) => REGION_OF[c.country] ?? c.country);
    const stages = bucket((c) => stageLabel(c.stage));
    const methods = bucket(methodOf);
    const largest = value > 0 ? Math.max(0, ...items.map((c) => holdingValue(c) / value)) : 0;

    // Portfolio score 0-100: how well spread, how well documented, how mature.
    const hhi = (rows: typeof sectors) => rows.reduce((a, r) => a + r.share * r.share, 0);
    const spread = (rows: typeof sectors) => (rows.length === 0 ? 0 : Math.max(0, 1 - hhi(rows)));
    const valuedShare = items.length === 0 ? 0 : items.filter((c) => c.last_valuation || c.post_money).length / items.length;
    const laterStage = items.length === 0 ? 0 : items.filter((c) => ["series_a", "series_b", "series_c", "growth"].includes(c.stage)).length / items.length;
    const concentration = Math.max(0, 1 - Math.max(0, largest - 0.25) / 0.75);
    const score = items.length === 0 ? null : Math.round(
      100 * (0.3 * spread(sectors) + 0.2 * spread(geos) + 0.2 * concentration + 0.2 * valuedShare + 0.1 * laterStage),
    );

    return { invested, value, moic: invested > 0 ? value / invested : null, sectors, geos, stages, methods, largest, score, valuedShare };
  }, [items]);

  const distribution = (title: string, rows: Array<{ label: string; value: number; share: number }>) => (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nothing to break down yet.</p> : rows.map((r) => (
          <div key={r.label} className="space-y-1">
            <div className="flex justify-between text-xs"><span className="capitalize">{r.label}</span><span className="text-muted-foreground">{(r.share * 100).toFixed(1)}% · {money(r.value)}</span></div>
            <Progress value={r.share * 100} className="h-1.5" />
          </div>
        ))}
      </CardContent>
    </Card>
  );

  return (
    <>
      <SEO
        title="Startup portfolio — sector, geography and method breakdown | Vela"
        description="Your startup holdings in one place: what you invested, what it is worth, how it is spread across sectors, countries, stages and valuation methods, with a portfolio score and live press sentiment."
        path="/startup-portfolio"
      />
      <TopNav />
      <div className="container mx-auto px-4 py-6 space-y-5 pb-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2"><Rocket className="h-5 w-5" />Startup portfolio</h1>
            <p className="text-sm text-muted-foreground">Your own startups, what they are worth and how the money is spread across sectors, countries, stages and valuation methods.</p>
          </div>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Add startup</Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-5">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Startups</p><p className="text-xl font-semibold">{items.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Invested</p><p className="text-xl font-semibold">{money(stats.invested)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Current value</p><p className="text-xl font-semibold">{money(stats.value)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Multiple on cost</p><p className="text-xl font-semibold">{stats.moic ? `${stats.moic.toFixed(2)}x` : "—"}</p></CardContent></Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Portfolio score</p>
              <p className="text-xl font-semibold">{stats.score == null ? "—" : `${stats.score}/100`}</p>
              {stats.score != null && <Progress value={stats.score} className="h-1.5 mt-2" />}
            </CardContent>
          </Card>
        </div>

        {stats.score != null && (
          <p className="text-xs text-muted-foreground">
            The score rewards spread across sectors and countries, penalises one position dominating the book,
            and rises as more holdings carry a real valuation ({Math.round(stats.valuedShare * 100)}% do today).
            Largest single position: {(stats.largest * 100).toFixed(0)}%.
          </p>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Holdings</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6">No startups yet. Add one to see the breakdowns and the portfolio score.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Sector</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Invested</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((c) => {
                      const v = holdingValue(c);
                      const inv = Number(c.amount_invested) || 0;
                      return (
                        <TableRow key={c.id} className={focus?.id === c.id ? "bg-muted/50" : undefined}>
                          <TableCell className="font-medium">
                            <button className="hover:underline text-left" onClick={() => setFocus(c)}>{c.name}</button>
                            {c.website && (
                              <a className="ml-2 inline-block align-middle" href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" aria-label={`Open ${c.name} website`}>
                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                              </a>
                            )}
                          </TableCell>
                          <TableCell><Badge variant="secondary">{stageLabel(c.stage)}</Badge></TableCell>
                          <TableCell className="text-sm capitalize">{c.sector}</TableCell>
                          <TableCell className="text-sm">{c.country}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{methodOf(c)}</TableCell>
                          <TableCell className="text-right text-sm">{money(inv, c.currency)}</TableCell>
                          <TableCell className={`text-right text-sm ${inv && v > inv ? "text-emerald-500" : inv && v < inv ? "text-destructive" : ""}`}>
                            {money(v, c.currency)}
                            {inv > 0 && <span className="block text-xs text-muted-foreground">{(v / inv).toFixed(2)}x</span>}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button size="icon" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => { setEditing(c); setDialogOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" aria-label={`Remove ${c.name}`} className="text-destructive" onClick={() => void remove(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-4">
          {distribution("Sector", stats.sectors)}
          {distribution("Geography", stats.geos)}
          {distribution("Stage", stats.stages)}
          {distribution("Valuation method", stats.methods)}
        </div>

        {items.length > 0 && (
          <StartupRiskCard
            money={(n) => money(n)}
            rows={items.map((c) => ({
              id: c.id,
              name: c.name,
              stage: c.stage,
              method: methodOf(c),
              sentiment: null,
              value: holdingValue(c),
              invested: Number(c.amount_invested) || 0,
            }))}
          />
        )}

        {items.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            <StartupSentimentCard
            key={focus?.id ?? items[0].id}
            name={(focus ?? items[0]).name}
            website={(focus ?? items[0]).website ?? undefined}
            sector={(focus ?? items[0]).sector}
              country={(focus ?? items[0]).country}
            />
            <StartupRegistryCard
              key={`reg-${focus?.id ?? items[0].id}`}
              name={(focus ?? items[0]).name}
              country={(focus ?? items[0]).country}
            />
          </div>
        )}
      </div>

      <CompanyFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        kind="startup"
        editing={editing}
        onSubmit={async (draft) => { editing ? await update(editing.id, draft as Partial<PrivateCompany>) : await add(draft); }}
      />
    </>
  );
}
