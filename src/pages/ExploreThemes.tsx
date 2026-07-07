import { useState } from "react";
import { Link } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, ArrowLeft, Compass } from "lucide-react";
import { AiDisclaimerStrip } from "@/components/AiDisclaimerStrip";
import { ValueChainDiagram } from "@/components/thematic/ValueChainDiagram";
import { ThemedResultsTable } from "@/components/thematic/ThemedResultsTable";
import { fetchThematicDeepDive } from "@/lib/thematic/client";
import { THEME_PRESETS, type RegionKey, type SizeBand, type ThematicResult } from "@/lib/thematic/schema";
import { useToast } from "@/hooks/use-toast";

const REGION_OPTIONS: Array<{ key: RegionKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "na", label: "North America" },
  { key: "eu", label: "Europe" },
  { key: "asia", label: "Asia" },
];

const SIZE_OPTIONS: Array<{ key: SizeBand; label: string }> = [
  { key: "all", label: "All sizes" },
  { key: "large", label: "Large (≥10B)" },
  { key: "mid", label: "Mid (2–10B)" },
  { key: "small", label: "Small & micro (<2B)" },
];

export default function ExploreThemes() {
  const { toast } = useToast();
  const [theme, setTheme] = useState("");
  const [region, setRegion] = useState<RegionKey>("all");
  const [size, setSize] = useState<SizeBand>("all");
  const [discoveryMode, setDiscoveryMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ThematicResult | null>(null);

  async function run(themeName: string) {
    if (!themeName.trim()) return;
    setLoading(true);
    try {
      const res = await fetchThematicDeepDive({ theme: themeName.trim(), region, size, discoveryMode });
      setData(res);
    } catch (err) {
      toast({
        title: "Deep-dive failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-6">
      <SEO
        title="Thematic Deep-Dive – Value chains & hidden small-cap winners"
        description="Pick a megatrend (AI infra, GLP-1, defence, uranium, grid) and map its full value chain: raw materials, components, manufacturers, distributors, end users — including small and micro caps mainstream screeners miss."
        path="/explore/themes"
      />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button asChild variant="ghost" size="sm" className="h-7 -ml-2">
          <Link to="/explore"><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Explore</Link>
        </Button>
        <span>/</span>
        <span className="text-foreground font-medium flex items-center gap-1.5"><Compass className="h-4 w-4" /> Thematic deep-dive</span>
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-bold">Map a megatrend to its full value chain</h1>
        <p className="text-muted-foreground max-w-2xl">
          Pick or type a theme. Vela AI expands the whole value chain — raw materials → components → manufacturers → distributors → end users — and screens listed companies across global exchanges, deliberately surfacing small and micro caps mainstream screeners miss.
        </p>
      </header>

      <Card className="p-4 md:p-5 card-gradient border-border space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="theme-input">Theme</Label>
          <div className="flex gap-2">
            <Input
              id="theme-input"
              placeholder="e.g. AI power infrastructure, GLP-1 drugs, small-modular nuclear, defence electronics…"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") run(theme); }}
            />
            <Button onClick={() => run(theme)} disabled={!theme.trim() || loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Deep-dive"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {THEME_PRESETS.map((p) => (
              <Badge
                key={p.id}
                variant="outline"
                className="cursor-pointer hover:border-primary hover:text-primary text-xs"
                onClick={() => { setTheme(p.label); run(p.label); }}
                title={p.hint}
              >
                {p.label}
              </Badge>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-muted-foreground">Region</Label>
            <div className="flex flex-wrap gap-1.5">
              {REGION_OPTIONS.map((o) => (
                <Badge
                  key={o.key}
                  variant={region === o.key ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => setRegion(o.key)}
                >{o.label}</Badge>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-muted-foreground">Market cap</Label>
            <div className="flex flex-wrap gap-1.5">
              {SIZE_OPTIONS.map((o) => (
                <Badge
                  key={o.key}
                  variant={size === o.key ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => setSize(o.key)}
                >{o.label}</Badge>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="discovery-toggle" className="text-xs uppercase text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" /> Discovery mode
            </Label>
            <div className="flex items-center gap-2">
              <Switch id="discovery-toggle" checked={discoveryMode} onCheckedChange={setDiscoveryMode} />
              <span className="text-xs text-muted-foreground">Lift small/micro caps above mega caps at equal fundamentals.</span>
            </div>
          </div>
        </div>
      </Card>

      <AiDisclaimerStrip />

      {loading && (
        <Card className="p-8 flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Mapping the value chain and screening candidates — this can take ~20 seconds.
        </Card>
      )}

      {data && !loading && (
        <div className="space-y-6">
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Value chain — {data.theme}</h2>
              {data.cached && <Badge variant="outline" className="text-[10px]">cached ({new Date(data.generated_at).toLocaleString()})</Badge>}
            </div>
            <ValueChainDiagram chain={data.chain} />
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-semibold">Ranked candidates ({data.results.length})</h2>
              <div className="text-xs text-muted-foreground">
                Region: {data.region} · Size: {data.size} · {data.discoveryMode ? "Discovery mode ON" : "Discovery mode OFF"}
              </div>
            </div>
            <ThemedResultsTable rows={data.results} discoveryMode={data.discoveryMode} />
            {data.sources && data.sources.length > 0 && (
              <p className="text-[11px] text-muted-foreground pt-1">
                Sources: {data.sources.map((s, i) => (
                  s.url
                    ? <a key={i} href={s.url} target="_blank" rel="noreferrer" className="underline mr-2">{s.label}</a>
                    : <span key={i} className="mr-2">{s.label}</span>
                ))}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}