import { useMemo, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Briefcase, Pencil, Trash2, ExternalLink } from "lucide-react";
import { CompanyFormDialog } from "@/components/company/CompanyFormDialog";
import { usePrivateCompanies, money, REGION_OF, STAGE_OPTIONS, type PrivateCompany } from "@/hooks/usePrivateCompanies";

const stageLabel = (id: string) => STAGE_OPTIONS.find((s) => s.id === id)?.label ?? id;

/** Value of a holding today: an explicit mark, else our share of the last post-money. */
function holdingValue(c: PrivateCompany): number {
  if (Number.isFinite(Number(c.current_valuation))) {
    const own = Number(c.ownership_pct);
    return Number.isFinite(own) && own > 0 ? Number(c.current_valuation) * (own / 100) : Number(c.current_valuation);
  }
  const post = Number(c.post_money);
  const own = Number(c.ownership_pct);
  if (Number.isFinite(post) && Number.isFinite(own)) return post * (own / 100);
  return Number(c.amount_invested) || 0;
}

export default function PrivateEquity() {
  const { items, loading, add, update, remove } = usePrivateCompanies("private");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PrivateCompany | null>(null);

  const stats = useMemo(() => {
    const invested = items.reduce((a, c) => a + (Number(c.amount_invested) || 0), 0);
    const value = items.reduce((a, c) => a + holdingValue(c), 0);
    const bucket = (pick: (c: PrivateCompany) => string) => {
      const map = new Map<string, number>();
      for (const c of items) {
        const k = pick(c) || "Unknown";
        map.set(k, (map.get(k) ?? 0) + holdingValue(c));
      }
      return [...map.entries()].map(([label, v]) => ({ label, value: v, share: value > 0 ? v / value : 0 }))
        .sort((a, b) => b.value - a.value);
    };
    return {
      invested, value,
      moic: invested > 0 ? value / invested : null,
      sectors: bucket((c) => c.sector),
      geos: bucket((c) => REGION_OF[c.country] ?? c.country),
      stages: bucket((c) => stageLabel(c.stage)),
      largest: value > 0 ? Math.max(0, ...items.map((c) => holdingValue(c) / value)) : 0,
    };
  }, [items]);

  const distribution = (title: string, rows: Array<{ label: string; value: number; share: number }>) => (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No holdings yet.</p> : rows.map((r) => (
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
        title="Private equity portfolio — holdings, valuations and exposure | Vela"
        description="Track private company holdings, what you invested, what you own and what it is worth, with sector and geography exposure."
        path="/private-equity"
      />
      <TopNav />
      <div className="container mx-auto px-4 py-6 space-y-5 pb-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2"><Briefcase className="h-5 w-5" />Private equity portfolio</h1>
            <p className="text-sm text-muted-foreground">Private companies you hold, their valuations and how your money is spread across sectors and countries.</p>
          </div>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Add holding</Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Holdings</p><p className="text-xl font-semibold">{items.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Invested</p><p className="text-xl font-semibold">{money(stats.invested)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Current value</p><p className="text-xl font-semibold">{money(stats.value)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Multiple on cost</p><p className="text-xl font-semibold">{stats.moic ? `${stats.moic.toFixed(2)}x` : "—"}</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Holdings</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6">No private holdings yet. Add one to see the exposure analytics.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Sector</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead className="text-right">Invested</TableHead>
                      <TableHead className="text-right">Owned</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((c) => {
                      const v = holdingValue(c);
                      const inv = Number(c.amount_invested) || 0;
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {c.name}
                              {c.website && (
                                <a href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" aria-label={`Open ${c.name} website`}>
                                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                </a>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">{c.status.replace("_", " ")}</span>
                          </TableCell>
                          <TableCell><Badge variant="secondary">{stageLabel(c.stage)}</Badge></TableCell>
                          <TableCell className="text-sm capitalize">{c.sector}</TableCell>
                          <TableCell className="text-sm">{c.country}</TableCell>
                          <TableCell className="text-right text-sm">{money(inv, c.currency)}</TableCell>
                          <TableCell className="text-right text-sm">{c.ownership_pct != null ? `${Number(c.ownership_pct).toFixed(1)}%` : "—"}</TableCell>
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

        <div className="grid gap-4 lg:grid-cols-3">
          {distribution("Sector exposure", stats.sectors)}
          {distribution("Geography", stats.geos)}
          {distribution("Stage", stats.stages)}
        </div>

        {items.length > 0 && stats.largest > 0.4 && (
          <p className="text-xs text-muted-foreground">
            Your largest single holding is {(stats.largest * 100).toFixed(0)}% of the private book — concentrated for an illiquid portfolio.
          </p>
        )}
      </div>

      <CompanyFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        kind="private"
        editing={editing}
        onSubmit={async (draft) => { editing ? await update(editing.id, draft as Partial<PrivateCompany>) : await add(draft); }}
      />
    </>
  );
}
