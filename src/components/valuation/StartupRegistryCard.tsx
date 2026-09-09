import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Landmark, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { readEdgeError } from "@/lib/edgeError";

interface RegistryRecord {
  register: string;
  jurisdiction: string;
  legalName: string;
  identifier?: string | null;
  identifierType?: string | null;
  status?: string | null;
  registeredAt?: string | null;
  address?: string | null;
  activity?: string | null;
  url?: string | null;
}

interface RegistryFiling {
  register: string;
  type: string;
  title: string;
  date: string | null;
  url: string;
}

interface RegistryResult {
  records: RegistryRecord[];
  filings: RegistryFiling[];
  registersQueried: string[];
  warnings: string[];
  asOf: string;
}

interface Props {
  name: string;
  country?: string;
}

/** Official register entries and filings for a private company. */
export function StartupRegistryCard({ name, country }: Props) {
  const [data, setData] = useState<RegistryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!name || name.trim().length < 2) return;
    setLoading(true);
    setError(null);
    const { data: res, error: err } = await supabase.functions.invoke("startup-registry", {
      body: { name: name.trim(), country },
    });
    if (err) setError((await readEdgeError(err)).message);
    else setData(res as RegistryResult);
    setLoading(false);
  }, [name, country]);

  useEffect(() => { void run(); }, [run]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2"><Landmark className="h-4 w-4" />Official registers &amp; filings</CardTitle>
        <Button size="sm" variant="ghost" onClick={() => void run()} disabled={loading} aria-label="Refresh register lookup">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!error && loading && !data && <p className="text-sm text-muted-foreground">Searching public company registers…</p>}

        {data?.records?.length ? (
          <div className="space-y-2">
            {data.records.map((r, i) => (
              <div key={`${r.register}-${r.identifier ?? i}`} className="rounded-md border p-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">{r.legalName}</span>
                  {r.jurisdiction && <Badge variant="secondary">{r.jurisdiction}</Badge>}
                  {r.status && <Badge variant="outline">{r.status}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.register}
                  {r.identifier ? ` · ${r.identifierType ?? "ID"} ${r.identifier}` : ""}
                  {r.registeredAt ? ` · registered ${r.registeredAt}` : ""}
                </p>
                {r.address && <p className="text-xs text-muted-foreground">{r.address}</p>}
                {r.activity && <p className="text-xs text-muted-foreground">{r.activity}</p>}
                {r.url && (
                  <a className="text-xs inline-flex items-center gap-1 hover:underline" href={r.url} target="_blank" rel="noreferrer">
                    Open the official entry <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          !loading && <p className="text-sm text-muted-foreground">No register entry matched this name yet. Try the full legal name, with the company suffix.</p>
        )}

        {data?.filings?.length ? (
          <div className="space-y-1">
            <p className="text-xs font-medium">Filings</p>
            {data.filings.map((f, i) => (
              <a key={`${f.url}-${i}`} href={f.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 text-xs hover:underline">
                <span className="truncate">{f.title}</span>
                <span className="text-muted-foreground whitespace-nowrap">{f.date ?? ""}</span>
              </a>
            ))}
          </div>
        ) : null}

        {data?.warnings?.length ? <p className="text-xs text-muted-foreground">{data.warnings.join(" ")}</p> : null}
        {data?.registersQueried?.length ? (
          <p className="text-[11px] text-muted-foreground">Checked: {data.registersQueried.join(", ")}.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
