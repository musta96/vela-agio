import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Coins, Loader2 } from "lucide-react";
import type { CompanyProfileData } from "@/hooks/useCompanyProfile";

interface Props {
  data: CompanyProfileData | null;
  loading: boolean;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString();
}

function daysAway(d: string | null | undefined): string | null {
  if (!d) return null;
  const dt = new Date(d).getTime();
  if (isNaN(dt)) return null;
  const diff = Math.round((dt - Date.now()) / 86_400_000);
  if (diff === 0) return "today";
  return diff > 0 ? `in ${diff}d` : `${Math.abs(diff)}d ago`;
}

function money(v: number | null | undefined, digits = 4) {
  return v == null || !Number.isFinite(v) ? "—" : v.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
}

/** Upcoming corporate calendar + dividend track record, Fineco style. */
export function EventsDividendsCard({ data, loading }: Props) {
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading events and dividends…
        </CardContent>
      </Card>
    );
  }

  const ev = data?.events;
  const dividends = data?.dividends ?? [];
  const splits = data?.splits ?? [];
  const cur = data?.currency ?? "";

  const upcoming: { label: string; date: string | null }[] = [
    { label: "Next earnings", date: ev?.nextEarnings ?? null },
    { label: "Ex-dividend date", date: ev?.exDividendDate ?? null },
    { label: "Dividend payment", date: ev?.dividendDate ?? null },
  ];

  const trailing12 = dividends
    .filter((d) => Date.now() - new Date(d.date).getTime() < 400 * 86_400_000)
    .reduce((s, d) => s + d.amount, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Next events</CardTitle>
          <CardDescription>Company calendar and consensus estimates.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {upcoming.map((u) => (
              <div key={u.label} className="flex items-center justify-between border-b border-border/40 py-1.5">
                <span className="text-sm text-muted-foreground">{u.label}</span>
                <span className="text-sm font-mono flex items-center gap-2">
                  {fmtDate(u.date)}
                  {daysAway(u.date) && <Badge variant="outline" className="text-[10px]">{daysAway(u.date)}</Badge>}
                </span>
              </div>
            ))}
          </div>

          {!!ev?.estimates?.length && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Consensus estimates</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left font-medium py-1">Period</th>
                    <th className="text-right font-medium py-1">EPS est.</th>
                    <th className="text-right font-medium py-1">Revenue est.</th>
                  </tr>
                </thead>
                <tbody>
                  {ev.estimates.map((e) => (
                    <tr key={e.period} className="border-b last:border-0 border-border/40">
                      <td className="py-1">{e.period}</td>
                      <td className="py-1 text-right font-mono">{e.epsAvg == null ? "—" : e.epsAvg.toFixed(2)}</td>
                      <td className="py-1 text-right font-mono">
                        {e.revenueAvg == null ? "—" : `${(e.revenueAvg / 1e9).toFixed(2)}B`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!!ev?.earningsHistory?.length && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Recent earnings surprises</p>
              <div className="space-y-1">
                {ev.earningsHistory.map((h) => (
                  <div key={h.quarter ?? Math.random()} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{fmtDate(h.quarter)}</span>
                    <span className="font-mono">
                      {h.epsActual == null ? "—" : h.epsActual.toFixed(2)} vs {h.epsEstimate == null ? "—" : h.epsEstimate.toFixed(2)}
                      {h.surprisePercent != null && (
                        <span className={h.surprisePercent >= 0 ? " text-success" : " text-destructive"}>
                          {" "}({h.surprisePercent >= 0 ? "+" : ""}{(h.surprisePercent * 100).toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Coins className="h-4 w-4" /> Dividends & splits</CardTitle>
          <CardDescription>
            {dividends.length ? `${dividends.length} payments on record · last 12m ${money(trailing12, 3)} ${cur}` : "No dividend history found."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!!dividends.length && (
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left font-medium py-1">Ex-date</th>
                    <th className="text-right font-medium py-1">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {dividends.map((d) => (
                    <tr key={d.date} className="border-b last:border-0 border-border/40">
                      <td className="py-1">{fmtDate(d.date)}</td>
                      <td className="py-1 text-right font-mono">{money(d.amount)} {cur}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!!splits.length && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Splits</p>
              <div className="flex flex-wrap gap-2">
                {splits.map((s) => (
                  <Badge key={s.date} variant="outline">{fmtDate(s.date)} · {s.ratio}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
