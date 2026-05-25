import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, Loader2 } from "lucide-react";
import { SEO } from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Row { symbol: string; score?: number; thesis?: string; risk?: string; price?: number; ret1m?: number; ret3m?: number; rsi14?: number; vol_ann_pct?: number; above_sma50?: boolean }

export default function AIScanner() {
  const [universe, setUniverse] = useState("ftse_mib");
  const [criteria, setCriteria] = useState("Quality + earnings momentum, RSI below 70, above 50-day MA, manageable volatility");
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [commentary, setCommentary] = useState("");

  const run = async () => {
    setLoading(true); setRows([]); setCommentary("");
    const { data, error } = await supabase.functions.invoke("ai-scanner", { body: { universe, criteria, limit } });
    setLoading(false);
    if (error) { toast.error("Scanner failed", { description: error.message }); return; }
    setRows(data.top ?? []);
    setCommentary(data.commentary ?? "");
    toast.success(`Scanned ${data.count} symbols`);
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="AI Opportunity Scanner · Vela" description="Scan markets and rank trading opportunities with AI." path="/ai-scanner" />
      <main className="container mx-auto px-4 py-6 space-y-5 max-w-6xl">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Sparkles className="h-6 w-6 text-primary" /> AI Opportunity Scanner</h1>
          <p className="text-sm text-muted-foreground">Describe what you're looking for. Vela ranks the universe using technicals + AI reasoning.</p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Scan parameters</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>Universe</Label>
              <Select value={universe} onValueChange={setUniverse}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ftse_mib">FTSE MIB</SelectItem>
                  <SelectItem value="sp100">S&amp;P 100 (subset)</SelectItem>
                  <SelectItem value="eu_blue">European blue chips</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Top results</Label>
              <Input type="number" min={3} max={25} value={limit} onChange={(e) => setLimit(Math.max(3, Math.min(25, Number(e.target.value) || 10)))} />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label>What are you looking for?</Label>
              <Textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} rows={2} maxLength={500} />
            </div>
            <div className="md:col-span-4">
              <Button onClick={run} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Run scan</Button>
            </div>
          </CardContent>
        </Card>

        {commentary && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 text-sm"><strong>AI commentary:</strong> {commentary}</CardContent>
          </Card>
        )}

        {rows.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Top {rows.length} ideas</CardTitle><CardDescription>Click a ticker for the full dossier.</CardDescription></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>#</TableHead><TableHead>Symbol</TableHead><TableHead>Score</TableHead>
                  <TableHead className="text-right">Price</TableHead><TableHead className="text-right">1M</TableHead><TableHead className="text-right">3M</TableHead>
                  <TableHead className="text-right">RSI</TableHead><TableHead className="text-right">Vol</TableHead>
                  <TableHead>Thesis</TableHead><TableHead>Risk</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={r.symbol}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell><Link to={`/stock/${encodeURIComponent(r.symbol)}`} className="font-mono font-semibold text-primary hover:underline">{r.symbol}</Link></TableCell>
                      <TableCell><Badge variant={r.score && r.score >= 70 ? "default" : "secondary"}>{r.score ?? "—"}</Badge></TableCell>
                      <TableCell className="text-right font-mono">{r.price ?? "—"}</TableCell>
                      <TableCell className={`text-right font-mono ${(r.ret1m ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>{r.ret1m ?? "—"}%</TableCell>
                      <TableCell className={`text-right font-mono ${(r.ret3m ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>{r.ret3m ?? "—"}%</TableCell>
                      <TableCell className="text-right font-mono">{r.rsi14 ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono">{r.vol_ann_pct ?? "—"}%</TableCell>
                      <TableCell className="max-w-sm text-xs">{r.thesis ?? "—"}</TableCell>
                      <TableCell className="max-w-xs text-xs text-muted-foreground">{r.risk ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}