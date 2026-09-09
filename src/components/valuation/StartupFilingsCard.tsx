import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, FileText, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { readEdgeError } from "@/lib/edgeError";

interface Filing {
  source: string;
  jurisdiction: string;
  form: string;
  title: string;
  date: string | null;
  url: string;
  summary?: string | null;
  amount?: number | null;
  currency?: string | null;
  verified: boolean;
}

interface FilingsResult {
  company: string;
  filings: Filing[];
  sourcesQueried: string[];
  warnings: string[];
  asOf: string;
}

interface Props {
  name: string;
  country?: string;
}

const fmtAmount = (n: number, ccy?: string | null) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: ccy || "USD", maximumFractionDigits: 0 }).format(n);

/** Official filings for a private company: SEC EDGAR, national registers, EU databases. */
export function StartupFilingsCard({ name, country }: Props) {
  const [data, setData] = useState<FilingsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const run = useCallback(async () => {
    if (!name || name.trim().length < 2) return;
    setLoading(true);
    setError(null);
    const { data: res, error: err } = await supabase.functions.invoke("startup-filings", {
      body: { name: name.trim(), country },
    });
    if (err) setError((await readEdgeError(err)).message);
    else setData(res as FilingsResult);
    setLoading(false);
  }, [name, country]);

  useEffect(() => { setShowAll(false); void run(); }, [run]);

  const filings = data?.filings ?? [];
  const verified = filings.filter((f) => f.verified);
  const pointers = filings.filter((f) => !f.verified);
  const shown = showAll ? verified : verified.slice(0, 8);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />Official filings
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={() => void run()} disabled={loading} aria-label="Refresh filings">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!error && loading && !data && <p className="text-sm text-muted-foreground">Reading government filing databases…</p>}

        {shown.length > 0 && (
          <div className="space-y-2">
            {shown.map((f, i) => (
              <div key={`${f.source}-${f.date ?? i}-${i}`} className="rounded-md border p-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{f.form}</Badge>
                  {f.date && <span className="font-mono text-xs text-muted-foreground">{f.date}</span>}
                  {typeof f.amount === "number" && f.amount > 0 && (
                    <Badge variant="outline">{fmtAmount(f.amount, f.currency)}</Badge>
                  )}
                  {f.jurisdiction && <Badge variant="outline">{f.jurisdiction}</Badge>}
                </div>
                <p className="text-sm">{f.title}</p>
                {f.summary && <p className="text-xs text-muted-foreground">{f.summary}</p>}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{f.source}</span>
                  {f.url && (
                    <a href={f.url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1">
                      Open filing <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
            {verified.length > shown.length && (
              <Button variant="outline" size="sm" onClick={() => setShowAll(true)}>
                Show all {verified.length} filings
              </Button>
            )}
          </div>
        )}

        {pointers.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Registers to confirm directly</p>
            {pointers.map((f, i) => (
              <a
                key={`p-${i}`}
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-md border border-dashed p-3 hover:bg-muted/50"
              >
                <span className="text-sm">{f.title}</span>
                <span className="block text-xs text-muted-foreground">{f.source}</span>
              </a>
            ))}
          </div>
        )}

        {!loading && data && verified.length === 0 && pointers.length === 0 && (
          <p className="text-sm text-muted-foreground">No official filing matched this name yet.</p>
        )}

        {data?.warnings?.length ? (
          <ul className="text-xs text-muted-foreground space-y-1">
            {data.warnings.map((w, i) => <li key={i}>• {w}</li>)}
          </ul>
        ) : null}

        {data?.sourcesQueried?.length ? (
          <p className="text-[11px] text-muted-foreground">Sources: {data.sourcesQueried.join(" · ")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
