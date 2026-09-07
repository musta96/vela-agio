import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { aggregate, geoFromSymbol, regionFromFundText } from "@/lib/geography";

interface Holding { symbol: string | null; name: string | null; weight: number | null }

interface Props {
  holdings: Holding[];
  fundName?: string | null;
  category?: string | null;
  description?: string | null;
  domicile?: string | null;
}

/**
 * Funds rarely publish a machine-readable country table, so geography is
 * rebuilt from the listing venue of the disclosed holdings and, when those are
 * missing, from the fund's own mandate wording. Always labelled as an estimate.
 */
export const FundGeographyCard = ({ holdings, fundName, category, description, domicile }: Props) => {
  const { countries, regions, coverage } = useMemo(() => {
    const rows = (holdings ?? []).filter((h) => h.symbol && (h.weight ?? 0) > 0);
    const cEntries: Array<[string, number]> = [];
    const rEntries: Array<[string, number]> = [];
    let covered = 0;
    for (const h of rows) {
      const geo = geoFromSymbol(h.symbol);
      const w = h.weight ?? 0;
      if (!geo) continue;
      covered += w;
      cEntries.push([geo.country, w]);
      rEntries.push([geo.region, w]);
    }
    return { countries: aggregate(cEntries), regions: aggregate(rEntries), coverage: covered };
  }, [holdings]);

  const mandateRegion = regionFromFundText(fundName, category, description);
  const scale = coverage > 0 ? 1 / coverage : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Geographic exposure</CardTitle>
        <CardDescription>
          {coverage > 0
            ? `Estimated from the listing country of the disclosed holdings (${(coverage * 100).toFixed(0)}% of the fund covered).`
            : "The fund does not disclose enough holdings to rebuild a country split."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {mandateRegion && (
          <p className="text-sm text-muted-foreground">
            Stated mandate: <span className="font-medium text-foreground">{mandateRegion}</span>
            {domicile ? ` · fund domiciled in ${domicile}` : ""}
          </p>
        )}

        {regions.length > 0 && (
          <div className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground">By region</div>
            {regions.map(([label, w]) => (
              <div key={label} className="space-y-1">
                <div className="flex justify-between text-xs"><span>{label}</span><span className="tabular-nums">{(w * scale * 100).toFixed(1)}%</span></div>
                <Progress value={Math.min(100, w * scale * 100)} />
              </div>
            ))}
          </div>
        )}

        {countries.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">By country</div>
            <div className="grid gap-1 sm:grid-cols-2">
              {countries.slice(0, 12).map(([label, w]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="truncate">{label}</span>
                  <span className="tabular-nums text-muted-foreground">{(w * scale * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
