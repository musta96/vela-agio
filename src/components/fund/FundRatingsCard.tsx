import { Star, ShieldAlert, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { FundProfileData } from "@/hooks/useFundProfile";

function Stars({ value }: { value: number }) {
  const n = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${n} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function gradeTone(score: number) {
  if (score >= 75) return "text-emerald-500";
  if (score >= 55) return "text-amber-500";
  return "text-destructive";
}
function riskTone(score: number) {
  if (score < 40) return "text-emerald-500";
  if (score < 70) return "text-amber-500";
  return "text-destructive";
}

/**
 * Ratings & scores block for the ETF / fund data sheet: the external
 * Morningstar ratings and ESG scores when the provider publishes them,
 * plus the proprietary Vela risk and overall score with its pillars.
 */
export function FundRatingsCard({ data }: { data: FundProfileData }) {
  const r = data.ratings;
  const v = data.velaScore;
  const hasExternal = !!r && [r.morningstarOverall, r.morningstarRisk, r.morningstarReturn, r.esgTotal]
    .some((x) => x != null && x !== 0);
  if (!v?.finalScore && !hasExternal) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Vela scores */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Vela score</CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger aria-label="How the Vela score is built">
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">{v?.methodology}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <CardDescription>
            Proprietary aggregate built from cost, risk-adjusted performance versus category,
            robustness and diversification.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border/60 bg-card/40 p-3">
              <div className="text-xs text-muted-foreground">Overall score</div>
              <div className={`text-3xl font-bold tabular-nums ${v?.finalScore != null ? gradeTone(v.finalScore) : ""}`}>
                {v?.finalScore ?? "—"}
                <span className="text-base font-medium text-muted-foreground">/100</span>
              </div>
              {v?.grade ? <Badge variant="outline" className="mt-1">Grade {v.grade}</Badge> : null}
            </div>
            <div className="rounded-lg border border-border/60 bg-card/40 p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <ShieldAlert className="h-3.5 w-3.5" /> Risk score
              </div>
              <div className={`text-3xl font-bold tabular-nums ${v?.riskScore != null ? riskTone(v.riskScore) : ""}`}>
                {v?.riskScore ?? "—"}
                <span className="text-base font-medium text-muted-foreground">/100</span>
              </div>
              {v?.riskLabel ? <Badge variant="outline" className="mt-1">{v.riskLabel} risk</Badge> : null}
            </div>
          </div>

          {(v?.pillars ?? []).length > 0 ? (
            <div className="space-y-3">
              {(v?.pillars ?? []).map((p) => (
                <div key={p.key} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="font-medium">{p.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {p.score}/100 · weight {Math.round(p.weight * 100)}%
                    </span>
                  </div>
                  <Progress value={p.score} />
                  <p className="text-[11px] text-muted-foreground">{p.detail}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Not enough published data to score this fund yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* External ratings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">External ratings</CardTitle>
          <CardDescription>Morningstar and sustainability data as published by the provider.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Morningstar overall</span>
            {r?.morningstarOverall ? <Stars value={r.morningstarOverall} /> : <span>—</span>}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Morningstar return</span>
            {r?.morningstarReturn ? <Stars value={r.morningstarReturn} /> : <span>—</span>}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Morningstar risk</span>
            <span className="tabular-nums">{r?.morningstarRisk ? `${r.morningstarRisk}/5` : "—"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Morningstar category</span>
            <span className="max-w-[55%] truncate text-right">{r?.morningstarCategory ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
            <span className="text-muted-foreground">ESG total risk</span>
            <span className="tabular-nums">{r?.esgTotal != null ? r.esgTotal.toFixed(1) : "—"}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div><div className="text-muted-foreground">E</div><div className="tabular-nums">{r?.esgEnvironment?.toFixed(1) ?? "—"}</div></div>
            <div><div className="text-muted-foreground">S</div><div className="tabular-nums">{r?.esgSocial?.toFixed(1) ?? "—"}</div></div>
            <div><div className="text-muted-foreground">G</div><div className="tabular-nums">{r?.esgGovernance?.toFixed(1) ?? "—"}</div></div>
          </div>
          {r?.esgPeerGroup ? (
            <p className="text-[11px] text-muted-foreground">Peer group: {r.esgPeerGroup}</p>
          ) : null}
          {data.identifiers?.ucits != null || data.identifiers?.domicile ? (
            <p className="text-[11px] text-muted-foreground">
              {data.identifiers?.ucits ? "UCITS" : "Non-UCITS"}
              {data.identifiers?.domicile ? ` · domiciled in ${data.identifiers.domicile}` : ""}
              {data.identifiers?.distribution ? ` · ${data.identifiers.distribution}` : ""}
            </p>
          ) : null}
          {data.isin ? (
            <p className="border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
              ISIN <span className="font-mono text-foreground">{data.isin}</span>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
