import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
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
  sourcesQueried: unknown[];
  warnings: unknown[];
  asOf: string;
}

interface Props {
  name: string;
  country?: string;
}

const fmtAmount = (n: number, ccy?: string | null) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: ccy || "USD", maximumFractionDigits: 0 }).format(n);

// Government APIs frequently return localized text as nested records rather
// than strings. Keep all values crossing that boundary safe for React.
const asText = (value: unknown, seen = new WeakSet<object>()): string | null => {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const parts = value.map((item) => asText(item, seen)).filter((item): item is string => Boolean(item));
    return parts.length ? parts.join(", ") : null;
  }
  if (typeof value !== "object" || seen.has(value)) return null;

  seen.add(value);
  const record = value as Record<string, unknown>;
  for (const key of ["title", "name", "value", "label", "code", "id", "rcn"]) {
    const text = asText(record[key], seen);
    if (text) return text;
  }
  return null;
};

/** Official filings for a private company: SEC EDGAR, national registers, EU databases. */
export function StartupFilingsCard({ name: rawName, country }: Props) {
  const name = useDebouncedValue(rawName, 800);
  const [data, setData] = useState<FilingsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const reqId = useRef(0);

  const run = useCallback(async () => {
    if (!name || name.trim().length < 2) return;
    const myReq = ++reqId.current;
    setLoading(true);
    setError(null);
    const { data: res, error: err } = await supabase.functions.invoke("startup-filings", {
      body: { name: name.trim(), country },
    });
    if (myReq !== reqId.current) return; // superseded by a newer request
    if (err) setError((await readEdgeError(err)).message);
    else setData(res as FilingsResult);
    setLoading(false);
  }, [name, country]);

  useEffect(() => { setShowAll(false); void run(); }, [run]);

  const filings = (data?.filings ?? []).map((f) => ({
    form: asText(f.form) ?? "Filing",
    title: asText(f.title) ?? "Untitled record",
    summary: asText(f.summary),
    source: asText(f.source) ?? "",
    jurisdiction: asText(f.jurisdiction),
    date: asText(f.date),
    url: asText(f.url) ?? "",
    amount: typeof f.amount === "number" && Number.isFinite(f.amount) ? f.amount : null,
    currency: asText(f.currency),
    verified: f.verified === true,
  }));
  const warnings = (data?.warnings ?? []).map((warning) => asText(warning)).filter((warning): warning is string => Boolean(warning));
  const sources = (data?.sourcesQueried ?? []).map((source) => asText(source)).filter((source): source is string => Boolean(source));
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
      <CardContent className="space-y-3 min-w-0 max-h-[60vh] overflow-y-auto [-webkit-overflow-scrolling:touch] md:max-h-none md:overflow-visible">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!error && loading && !data && <p className="text-sm text-muted-foreground">Reading government filing databases…</p>}

        {shown.length > 0 && (
          <div className="space-y-2">
            {shown.map((f, i) => (
              <div key={`${f.source}-${f.date ?? i}-${i}`} className="rounded-md border p-2.5 sm:p-3 space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <Badge variant="secondary">{f.form}</Badge>
                  {f.date && <span className="font-mono text-xs text-muted-foreground">{f.date}</span>}
                  {typeof f.amount === "number" && f.amount > 0 && (
                    <Badge variant="outline">{fmtAmount(f.amount, f.currency)}</Badge>
                  )}
                  {f.jurisdiction && <Badge variant="outline">{f.jurisdiction}</Badge>}
                </div>
                <p className="text-sm break-words">{f.title}</p>
                {f.summary && <p className="text-xs text-muted-foreground line-clamp-3 break-words">{f.summary}</p>}
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="text-xs text-muted-foreground truncate">{f.source}</span>
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

        {warnings.length ? (
          <ul className="text-xs text-muted-foreground space-y-1">
            {warnings.map((warning, i) => <li key={i}>• {warning}</li>)}
          </ul>
        ) : null}

        {sources.length ? (
          <p className="text-[11px] text-muted-foreground">Sources: {sources.join(" · ")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
