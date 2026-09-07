import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Globe, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { readEdgeError } from "@/lib/edgeError";
import { toast } from "sonner";

interface Research {
  site: string;
  pagesRead: Array<{ url: string; title: string }>;
  summary: string;
  products: string[];
  customers: string[];
  markets: string[];
  team: string[];
  funding: string[];
  missing: string[];
  facts: Array<{ field: string; value: string; source: string }>;
}

const storeKey = (symbol: string) => `vela.website.${symbol.toUpperCase()}`;

/**
 * Lets the user point the analysis at the company's / issuer's own website.
 * The AI may only report what the pages actually say, and every fact keeps the
 * page it came from, so nothing here is invented.
 */
export function CompanyWebsiteFacts({ symbol, name, defaultWebsite }: { symbol: string; name?: string; defaultWebsite?: string | null }) {
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<Research | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(storeKey(symbol));
    setWebsite(saved || defaultWebsite || "");
    setRes(null);
  }, [symbol, defaultWebsite]);

  const run = async () => {
    if (!website.trim()) { toast.error("Add the website address first"); return; }
    setLoading(true);
    try {
      localStorage.setItem(storeKey(symbol), website.trim());
      const { data, error } = await supabase.functions.invoke("site-facts", {
        body: { website: website.trim(), symbol, name },
      });
      if (error) throw new Error((await readEdgeError(error)).message);
      if (data?.error) throw new Error(data.message ?? data.error);
      setRes(data.research as Research);
      if (!data.research?.facts?.length && data.research?.missing?.length) toast.info(data.research.missing[0]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the website");
    } finally { setLoading(false); }
  };

  const list = (title: string, values: string[]) => values.length ? (
    <div>
      <p className="text-xs font-medium mb-1">{title}</p>
      <div className="flex flex-wrap gap-1">{values.map((v, i) => <Badge key={`${title}-${i}`} variant="secondary" className="font-normal">{v}</Badge>)}</div>
    </div>
  ) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4" />Company website</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <Label className="text-xs" htmlFor={`site-${symbol}`}>Website address — the AI reads these pages and only reports what they say</Label>
            <Input id={`site-${symbol}`} value={website} placeholder="www.company.com" onChange={(e) => setWebsite(e.target.value)} />
          </div>
          <Button onClick={run} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Globe className="h-4 w-4 mr-2" />}Read the site
          </Button>
        </div>

        {res && (
          <div className="space-y-3">
            {res.summary && <p className="text-sm">{res.summary}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {list("Products & services", res.products)}
              {list("Customers named", res.customers)}
              {list("Markets", res.markets)}
              {list("Team", res.team)}
              {list("Funding", res.funding)}
            </div>

            {res.facts.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-1">Facts taken from the site</p>
                <ul className="space-y-1">
                  {res.facts.map((f, i) => (
                    <li key={i} className="text-xs">
                      <span className="font-medium">{f.field}:</span> {f.value}{" "}
                      <a href={f.source} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-0.5">
                        source<ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {res.missing.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-1">Not stated on the site</p>
                <ul className="list-disc pl-4 text-xs text-muted-foreground">{res.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
              </div>
            )}

            {res.pagesRead.length > 0 && (
              <p className="text-xs text-muted-foreground">Read {res.pagesRead.length} page{res.pagesRead.length === 1 ? "" : "s"} from {res.site}.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
