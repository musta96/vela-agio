import { useMemo, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Rocket, Pencil, Trash2, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { CompanyFormDialog } from "@/components/company/CompanyFormDialog";
import { StartupValuationPanel } from "@/components/valuation/StartupValuationPanel";
import { usePrivateCompanies, money, STAGE_OPTIONS, type PrivateCompany } from "@/hooks/usePrivateCompanies";
import { toast } from "sonner";

const stageLabel = (id: string) => STAGE_OPTIONS.find((s) => s.id === id)?.label ?? id;

export default function StartupWatchlist() {
  const { items, loading, add, update, remove } = usePrivateCompanies("startup");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PrivateCompany | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");

  const filtered = useMemo(() => items.filter((c) => {
    if (stageFilter !== "all" && c.stage !== stageFilter) return false;
    const q = query.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.sector.toLowerCase().includes(q) || c.country.toLowerCase().includes(q);
  }), [items, query, stageFilter]);

  const totals = useMemo(() => {
    const valued = items.filter((c) => Number(c.current_valuation ?? c.post_money));
    const sum = valued.reduce((a, c) => a + Number(c.current_valuation ?? c.post_money ?? 0), 0);
    return { count: items.length, valued: valued.length, sum };
  }, [items]);

  return (
    <>
      <SEO
        title="Startup watchlist — track stage, round and valuation | Vela"
        description="Follow the startups you are looking at: stage, round on the table, valuation and a full startup valuation with benchmarks and PDF export."
        path="/startups"
      />
      <TopNav />
      <div className="container mx-auto px-4 py-6 space-y-5 pb-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2"><Rocket className="h-5 w-5" />Startup watchlist</h1>
            <p className="text-sm text-muted-foreground">Your own startups by stage, round and valuation — with the full startup analysis on each.</p>
          </div>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Add startup</Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Startups tracked</p><p className="text-xl font-semibold">{totals.count}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">With a valuation</p><p className="text-xl font-semibold">{totals.valued}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Combined valuation</p><p className="text-xl font-semibold">{money(totals.sum)}</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Companies</CardTitle>
            <div className="flex gap-2">
              <Input className="h-9 w-40 sm:w-56" placeholder="Search name, sector…" value={query} onChange={(e) => setQuery(e.target.value)} />
              <select aria-label="Filter by stage" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
                <option value="all">All stages</option>
                {STAGE_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6">No startups yet. Add the first one to start tracking it.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Sector</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Round</TableHead>
                      <TableHead className="text-right">Valuation</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c) => (
                      <>
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
                          <TableCell className="text-sm">{c.sector}</TableCell>
                          <TableCell className="text-sm">{c.country}</TableCell>
                          <TableCell className="text-sm">
                            {c.round_name || "—"}
                            {c.round_size ? <span className="block text-xs text-muted-foreground">{money(c.round_size, c.currency)}</span> : null}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {money(c.current_valuation ?? c.post_money, c.currency)}
                            {c.pre_money ? <span className="block text-xs text-muted-foreground">pre {money(c.pre_money, c.currency)}</span> : null}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button size="sm" variant="outline" onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                              {openId === c.id ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}Analyse
                            </Button>
                            <Button size="icon" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => { setEditing(c); setDialogOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" aria-label={`Remove ${c.name}`} className="text-destructive" onClick={() => void remove(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </TableCell>
                        </TableRow>
                        {openId === c.id && (
                          <TableRow key={`${c.id}-panel`}>
                            <TableCell colSpan={7} className="bg-muted/30">
                              <StartupValuationPanel
                                initialProfile={{
                                  name: c.name, country: c.country, currency: c.currency, sector: c.sector,
                                  website: c.website ?? "", description: c.description ?? "",
                                }}
                                initialForm={{
                                  stage: c.stage,
                                  roundSize: c.round_size?.toString() ?? "",
                                  ...(c.inputs as Record<string, string>),
                                }}
                                onResult={async (res, profile) => {
                                  const range = (res as { range?: { weighted?: number } }).range;
                                  await update(c.id, {
                                    last_valuation: res as Record<string, unknown>,
                                    last_valued_at: new Date().toISOString(),
                                    current_valuation: Number(range?.weighted) || c.current_valuation,
                                    website: profile.website || c.website,
                                  });
                                  toast.success("Valuation saved to the watchlist");
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
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
