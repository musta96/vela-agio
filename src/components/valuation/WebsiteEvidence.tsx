import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Globe } from "lucide-react";

export interface WebsiteResearch {
  site?: string;
  error?: string;
  summary?: string;
  pagesRead?: Array<{ url: string; title: string }>;
  facts?: Array<{ field: string; value: string; source: string }>;
  products?: string[];
  customers?: string[];
  markets?: string[];
  team?: string[];
  funding?: string[];
  missing?: string[];
}

const List = ({ label, items }: { label: string; items?: string[] }) =>
  !items?.length ? null : (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1">
        {items.map((i) => <Badge key={i} variant="secondary" className="font-normal">{i}</Badge>)}
      </div>
    </div>
  );

/** What the appraisal read on the company's own site, with the page it came from. */
export function WebsiteEvidence({ research }: { research: WebsiteResearch }) {
  if (!research) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="h-4 w-4" /> Read from the company website
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {research.error && (
          <p className="text-muted-foreground">
            The site could not be read ({research.error}). Nothing from the web was used in the valuation.
          </p>
        )}
        {research.summary && <p className="leading-relaxed">{research.summary}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <List label="Products / services" items={research.products} />
          <List label="Customers named" items={research.customers} />
          <List label="Markets" items={research.markets} />
          <List label="Team" items={research.team} />
          <List label="Funding mentioned" items={research.funding} />
        </div>

        {!!research.facts?.length && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Sourced facts</div>
            <ul className="space-y-1">
              {research.facts.map((f, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-1">
                  <span className="font-medium">{f.field}:</span>
                  <span>{f.value}</span>
                  <a href={f.source} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-0.5 text-xs hover:underline">
                    <ExternalLink className="h-3 w-3" />source
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!!research.missing?.length && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Not disclosed on the site (supply it yourself)</div>
            <ul className="list-disc pl-5 text-muted-foreground">
              {research.missing.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </div>
        )}

        {!!research.pagesRead?.length && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Pages read ({research.pagesRead.length})</summary>
            <ul className="mt-1 space-y-0.5">
              {research.pagesRead.map((p) => (
                <li key={p.url}>
                  <a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">{p.title || p.url}</a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
