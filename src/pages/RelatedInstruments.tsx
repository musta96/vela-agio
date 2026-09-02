import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TickerSearch } from "@/components/TickerSearch";
import { Network, Loader2, Search } from "lucide-react";
import { SEO } from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Node { symbol: string; name?: string; reason?: string; group: "peers" | "thematic" | "sector_etf" }

export default function RelatedInstruments() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [symbol, setSymbol] = useState(params.get("symbol") ?? "AAPL");
  const [loading, setLoading] = useState(false);
  const [center, setCenter] = useState<{ symbol: string; name: string; sector: string; industry: string } | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);

  const fetchIt = async (sym: string) => {
    setLoading(true); setNodes([]); setCenter(null);
    const { data, error } = await supabase.functions.invoke("related-instruments", { body: { symbol: sym } });
    setLoading(false);
    if (error) { toast.error("Could not load related instruments", { description: error.message }); return; }
    setCenter({ symbol: data.symbol, name: data.name, sector: data.sector, industry: data.industry });
    const all: Node[] = [];
    (["peers", "thematic", "sector_etf"] as const).forEach((g) => (data.groups?.[g] ?? []).forEach((n: any) => all.push({ ...n, group: g })));
    setNodes(all);
  };

  useEffect(() => { fetchIt(symbol); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const s = symbol.trim().toUpperCase(); if (!s) return;
    setParams({ symbol: s }); fetchIt(s);
  };

  // Radial layout
  const radius = 220; const W = 720; const H = 520;
  const cx = W / 2, cy = H / 2;
  const groupAngle: Record<string, number> = { peers: -Math.PI / 2, thematic: Math.PI / 6, sector_etf: Math.PI - Math.PI / 6 };
  const groupCount: Record<string, number> = {};
  nodes.forEach((n) => { groupCount[n.group] = (groupCount[n.group] ?? 0) + 1; });
  const idx: Record<string, number> = { peers: 0, thematic: 0, sector_etf: 0 };

  const groupColor: Record<string, string> = { peers: "hsl(var(--primary))", thematic: "hsl(var(--accent))", sector_etf: "hsl(var(--success))" };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Related Instruments · Vela" description="Discover peers, sector ETFs and AI-derived related instruments." path="/related" />
      <main className="container mx-auto px-4 py-6 space-y-5 max-w-6xl">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Network className="h-6 w-6 text-primary" /> Related Instruments</h1>
          <p className="text-sm text-muted-foreground">Peers, sector ETFs and thematic neighbours discovered by AI.</p>
        </div>

        <form onSubmit={onSearch} className="flex gap-2 max-w-md items-end">
          <div className="flex-1"><TickerSearch value={symbol} onValueChange={setSymbol} onSelect={(hit) => setSymbol(hit.symbol.toUpperCase())} placeholder="Search instrument" clearOnSelect /></div>
          <Button type="submit" disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Explore</Button>
        </form>

        {center && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{center.name} <span className="font-mono text-sm text-muted-foreground">({center.symbol})</span></CardTitle>
              <CardDescription>{center.sector}{center.industry ? ` · ${center.industry}` : ""}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="w-full overflow-x-auto">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[520px]">
                  {/* Edges */}
                  {nodes.map((n) => {
                    const total = groupCount[n.group] || 1;
                    const base = groupAngle[n.group] ?? 0;
                    const spread = Math.PI / 2;
                    const i = idx[n.group]++;
                    const a = base + (i - (total - 1) / 2) * (spread / Math.max(1, total));
                    const x = cx + Math.cos(a) * radius; const y = cy + Math.sin(a) * radius;
                    (n as any)._x = x; (n as any)._y = y;
                    return <line key={`l-${n.symbol}`} x1={cx} y1={cy} x2={x} y2={y} stroke="hsl(var(--border))" strokeWidth={1} />;
                  })}
                  {/* Center */}
                  <g>
                    <circle cx={cx} cy={cy} r={42} fill="hsl(var(--primary))" />
                    <text x={cx} y={cy + 4} textAnchor="middle" className="font-mono text-sm fill-primary-foreground font-bold">{center.symbol}</text>
                  </g>
                  {/* Nodes */}
                  {nodes.map((n) => (
                    <g key={n.symbol} className="cursor-pointer" onClick={() => navigate(`/stock/${encodeURIComponent(n.symbol)}`)}>
                      <circle cx={(n as any)._x} cy={(n as any)._y} r={30} fill={groupColor[n.group]} fillOpacity={0.15} stroke={groupColor[n.group]} />
                      <text x={(n as any)._x} y={(n as any)._y + 4} textAnchor="middle" className="font-mono text-[10px] fill-foreground font-semibold">{n.symbol}</text>
                    </g>
                  ))}
                </svg>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <Badge style={{ background: "hsl(var(--primary) / 0.15)", color: "hsl(var(--primary))" }}>Peers</Badge>
                <Badge style={{ background: "hsl(var(--accent) / 0.15)", color: "hsl(var(--accent))" }}>Thematic (AI)</Badge>
                <Badge style={{ background: "hsl(var(--success) / 0.15)", color: "hsl(var(--success))" }}>Sector ETF</Badge>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                {(["peers", "thematic", "sector_etf"] as const).map((g) => (
                  <div key={g}>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {g === "peers" ? "Peers" : g === "thematic" ? "Thematic (AI)" : "Sector ETF"}
                    </div>
                    <ul className="space-y-2">
                      {nodes.filter((n) => n.group === g).map((n) => (
                        <li key={n.symbol} className="rounded border border-border bg-card/40 p-2">
                          <Link to={`/stock/${encodeURIComponent(n.symbol)}`} className="font-mono text-sm font-semibold text-primary hover:underline">{n.symbol}</Link>
                          {n.name && <span className="ml-2 text-xs text-muted-foreground">{n.name}</span>}
                          {n.reason && <p className="mt-1 text-xs text-muted-foreground">{n.reason}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}