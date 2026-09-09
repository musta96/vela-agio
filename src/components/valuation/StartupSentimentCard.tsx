import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, RefreshCw, Newspaper, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { readEdgeError } from "@/lib/edgeError";

export interface StartupSentiment {
  company: string;
  score: number | null;
  label: string;
  summary: string;
  drivers: Array<{ text: string; direction: string }>;
  method: string;
  model?: string | null;
  degradedReason?: string | null;
  articleCount: number;
  sources: string[];
  articles: Array<{ title: string; link: string; source: string; pubDate: string; score: number | null }>;
  asOf: string;
}

interface Props {
  name: string;
  website?: string;
  sector?: string;
  country?: string;
  /** Lets the parent fold the live score into its own numbers. */
  onScore?: (s: StartupSentiment) => void;
  /** Refresh interval in ms while the card is visible. 0 disables it. */
  refreshMs?: number;
}

const tone = (score: number | null) =>
  score == null ? "text-muted-foreground"
    : score >= 15 ? "text-emerald-500"
    : score <= -15 ? "text-destructive"
    : "text-foreground";

export function StartupSentimentCard({ name, website, sector, country, onScore, refreshMs = 300000 }: Props) {
  const [data, setData] = useState<StartupSentiment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cb = useRef(onScore);
  cb.current = onScore;

  const run = useCallback(async () => {
    if (!name || name.trim().length < 2) return;
    setLoading(true);
    setError(null);
    const { data: res, error: err } = await supabase.functions.invoke("startup-sentiment", {
      body: { name: name.trim(), website, sector, country },
    });
    if (err) {
      setError((await readEdgeError(err)).message);
    } else {
      setData(res as StartupSentiment);
      cb.current?.(res as StartupSentiment);
    }
    setLoading(false);
  }, [name, website, sector, country]);

  useEffect(() => {
    void run();
    if (!refreshMs) return;
    const id = setInterval(() => void run(), refreshMs);
    return () => clearInterval(id);
  }, [run, refreshMs]);

  if (!name || name.trim().length < 2) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Newspaper className="h-4 w-4" />Live sentiment</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Type the company name above to read what the press is saying about it.</p></CardContent>
      </Card>
    );
  }

  const pos = data?.score != null ? (data.score + 100) / 2 : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2"><Newspaper className="h-4 w-4" />Live sentiment</CardTitle>
        <Button size="sm" variant="ghost" onClick={() => void run()} disabled={loading} aria-label="Refresh sentiment">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {loading && !data && <p className="text-sm text-muted-foreground">Reading the news about {name}…</p>}

        {data && (
          <>
            <div className="flex items-baseline gap-3">
              <span className={`text-3xl font-semibold ${tone(data.score)}`}>{data.score == null ? "—" : data.score > 0 ? `+${data.score}` : data.score}</span>
              <Badge variant="secondary" className="capitalize">{data.label}</Badge>
              <span className="text-xs text-muted-foreground">{data.articleCount} article{data.articleCount === 1 ? "" : "s"}</span>
            </div>
            {data.score != null && <Progress value={pos} className="h-1.5" />}
            {data.summary && <p className="text-sm text-muted-foreground">{data.summary}</p>}

            {data.drivers.length > 0 && (
              <ul className="space-y-1">
                {data.drivers.map((d, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className={d.direction === "positive" ? "text-emerald-500" : d.direction === "negative" ? "text-destructive" : "text-muted-foreground"}>•</span>
                    <span>{d.text}</span>
                  </li>
                ))}
              </ul>
            )}

            {data.articles.length > 0 && (
              <div className="space-y-1 pt-1 border-t">
                {data.articles.slice(0, 6).map((a) => (
                  <a key={a.link} href={a.link} target="_blank" rel="noreferrer" className="flex items-start gap-2 text-xs hover:underline">
                    <ExternalLink className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1">{a.title}</span>
                    <span className="text-muted-foreground whitespace-nowrap">{a.source}</span>
                  </a>
                ))}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              {data.method === "ai" ? `Scored by ${data.model ?? "AI"}` : "Scored by the keyword model"}
              {data.degradedReason ? ` — ${data.degradedReason}` : ""} · updated {new Date(data.asOf).toLocaleTimeString()}
              {refreshMs ? ` · refreshes every ${Math.round(refreshMs / 60000)} min` : ""}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
