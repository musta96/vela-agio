import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ExternalLink, LineChart, FileText, Loader2 } from "lucide-react";
import { fetchThematicDeepDive } from "@/lib/thematic/client";
import { SEGMENT_LABELS, type RankedCompany, type ThematicResult } from "@/lib/thematic/schema";

const CACHE_KEY = "vela:lastThematicResult";

function readCached(): ThematicResult | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as ThematicResult) : null;
  } catch {
    return null;
  }
}

export default function ThematicCompanyDrilldown() {
  const { symbol = "" } = useParams<{ symbol: string }>();
  const [params] = useSearchParams();
  const themeParam = params.get("theme") ?? "";
  const [data, setData] = useState<ThematicResult | null>(() => readCached());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decoded = decodeURIComponent(symbol).toUpperCase();

  useEffect(() => {
    const cached = readCached();
    if (cached && cached.theme.toLowerCase() === themeParam.toLowerCase() && cached.results.some((r) => r.symbol === decoded)) {
      setData(cached);
      return;
    }
    if (!themeParam) { setError("No theme context. Return to /explore/themes."); return; }
    setLoading(true);
    fetchThematicDeepDive({ theme: themeParam })
      .then((r) => { setData(r); try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(r)); } catch { /* noop */ } })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [themeParam, decoded]);

  const company: RankedCompany | undefined = useMemo(
    () => data?.results.find((r) => r.symbol.toUpperCase() === decoded),
    [data, decoded],
  );
  const chainCompany = useMemo(() => {
    if (!data) return undefined;
    for (const seg of data.chain) {
      const c = seg.companies.find((c) => c.symbol.toUpperCase() === decoded);
      if (c) return { ...c, segment: seg.segment };
    }
    return undefined;
  }, [data, decoded]);

  const evidence = company?.evidence ?? chainCompany?.evidence ?? [];
  const thesis = company?.thesis ?? chainCompany?.thesis;
  const exposurePct = company?.exposurePct ?? chainCompany?.exposurePct ?? null;
  const segment = company?.segment ?? chainCompany?.segment;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 space-y-6">
      <SEO
        title={`${decoded} — Why it matches ${data?.theme ?? themeParam}`}
        description={`Thematic drilldown: value-chain link, revenue exposure and key metrics tying ${decoded} to the ${data?.theme ?? themeParam} megatrend.`}
        path={`/explore/themes/company/${symbol}`}
      />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button asChild variant="ghost" size="sm" className="h-7 -ml-2">
          <Link to="/explore/themes"><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to thematic results</Link>
        </Button>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-mono">{decoded}</h1>
          <p className="text-muted-foreground">{company?.name ?? chainCompany?.name ?? "Company"} · Theme: <span className="text-foreground font-medium">{data?.theme ?? themeParam}</span></p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link to={`/technical?symbol=${encodeURIComponent(decoded)}`}><LineChart className="h-3.5 w-3.5 mr-1.5" /> Entry timing</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to={`/stock/${encodeURIComponent(decoded)}`}><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Full profile</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to={`/portfolio-memo?symbols=${encodeURIComponent(decoded)}`}><FileText className="h-3.5 w-3.5 mr-1.5" /> Add to memo</Link></Button>
        </div>
      </header>

      {loading && (
        <Card className="p-8 flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading thematic context…
        </Card>
      )}
      {error && !loading && (
        <Card className="p-4 text-sm text-destructive border-destructive/40">{error}</Card>
      )}

      {!loading && data && (
        <>
          <Card className="p-4 md:p-5 space-y-3 card-gradient border-border">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold">Why it matches</h2>
              {segment && <Badge variant="outline" className="text-[10px]">{SEGMENT_LABELS[segment]}</Badge>}
              {company && <Badge variant="outline" className="text-[10px]">{company.exposure}</Badge>}
              {exposurePct != null && (
                <Badge variant="outline" className="text-[10px] font-mono">est. {exposurePct.toFixed(0)}% revenue exposure</Badge>
              )}
            </div>
            {thesis && <p className="text-sm text-muted-foreground">{thesis}</p>}
            {evidence.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Supporting evidence</p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {evidence.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            {segment && (
              <div className="text-xs text-muted-foreground pt-1">
                Value-chain link: <span className="text-foreground">{SEGMENT_LABELS[segment]}</span>
                {" → "} sits {segment === "raw_materials" ? "upstream in the theme's supply chain" : segment === "end_users" ? "as an end beneficiary of theme adoption" : "in the middle of the theme's value chain"}.
              </div>
            )}
          </Card>

          {company && (
            <Card className="p-4 md:p-5 space-y-3 card-gradient border-border">
              <h2 className="text-lg font-semibold">Key metrics</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <Metric label="Market cap" value={fmtMcap(company.marketCap)} />
                <Metric label="Price" value={company.price != null ? `${company.price.toFixed(2)} ${company.currency ?? ""}` : "—"} />
                <Metric label="Revenue growth" value={fmtPct(company.revGrowth)} />
                <Metric label="P/E" value={company.pe != null ? company.pe.toFixed(1) : "—"} />
                <Metric label="Sentiment" value={company.sentiment != null ? company.sentiment.toFixed(2) : "—"} />
                <Metric label="Region" value={company.region ?? "—"} />
                <Metric label="Composite score" value={company.score.toFixed(0)} />
                <Metric label="Discovery pick" value={company.discovery ? "Yes" : "No"} />
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground">
                Combine this with the ticker's <Link to={`/technical?symbol=${encodeURIComponent(decoded)}`} className="underline">Entry Timing</Link> signals and the memo builder to decide when — not just what — to buy.
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-mono font-semibold">{value}</p>
    </div>
  );
}

function fmtMcap(v: number | null | undefined): string {
  if (!v || !Number.isFinite(v)) return "—";
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  return v.toLocaleString();
}
function fmtPct(v: number | null | undefined, dp = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(dp)}%`;
}