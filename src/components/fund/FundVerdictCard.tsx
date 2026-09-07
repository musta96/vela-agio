import { useMemo } from "react";
import { Lightbulb } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRecommendationVerdicts } from "@/hooks/useRecommendationVerdicts";
import type { FundProfileData } from "@/hooks/useFundProfile";
import type { OHLCBar } from "@/lib/technicalIndicators";

interface Props {
  data: FundProfileData;
  bars: OHLCBar[];
}

const sma = (v: number[], n: number) => (v.length < n ? null : v.slice(-n).reduce((a, b) => a + b, 0) / n);

/**
 * The fund/ETF equivalent of the stock page verdict card: one blended read on
 * cost, size, track record versus category, quality score and price trend.
 */
export const FundVerdictCard = ({ data, bars }: Props) => {
  const { enabled: showVerdicts } = useRecommendationVerdicts();

  const read = useMemo(() => {
    const pros: string[] = [];
    const cons: string[] = [];
    let score = 0;

    const closes = bars.map((b) => b.close).filter((c) => isFinite(c) && c > 0);
    const last = closes[closes.length - 1] ?? null;
    const s50 = sma(closes, 50);
    const s200 = sma(closes, 200);
    if (last != null && s50 != null && s200 != null) {
      if (s50 > s200 && last > s50) { score += 20; pros.push("Price trend: above both the 50- and 200-day averages."); }
      else if (s50 < s200 && last < s50) { score -= 20; cons.push("Price trend: below both the 50- and 200-day averages."); }
      else pros.push("Price trend: mixed, moving averages are crossing.");
    }

    const kf = (data.keyFacts ?? {}) as Record<string, number | null>;
    const catTer = (data.fees as any)?.category?.annualReportExpenseRatio ?? null;
    if (kf.ter != null) {
      const cheap = catTer != null ? kf.ter <= catTer : kf.ter <= 0.003;
      const txt = `Ongoing charge ${(kf.ter * 100).toFixed(2)}%${catTer != null ? ` vs category ${(catTer * 100).toFixed(2)}%` : ""}.`;
      if (cheap) { score += 15; pros.push(`Cost: ${txt}`); } else { score -= 15; cons.push(`Cost: ${txt}`); }
    }

    if (kf.totalAssets != null) {
      const fmt = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(kf.totalAssets);
      if (kf.totalAssets >= 1e8) { score += 8; pros.push(`Scale: ${fmt} under management — liquid and unlikely to close.`); }
      else { score -= 12; cons.push(`Scale: only ${fmt} under management — closure and spread risk.`); }
    }

    const t = (data.performance?.trailing ?? {}) as Record<string, number | null>;
    const c = (data.performance?.trailingCategory ?? {}) as Record<string, number | null>;
    for (const [k, label] of [["threeYear", "3-year"], ["fiveYear", "5-year"]] as const) {
      if (t[k] != null && c[k] != null) {
        const diff = (t[k] as number) - (c[k] as number);
        const txt = `${label} return ${diff >= 0 ? "ahead of" : "behind"} its category by ${(Math.abs(diff) * (Math.abs(diff) <= 1.5 ? 100 : 1)).toFixed(2)}%.`;
        if (diff >= 0) { score += 12; pros.push(`Track record: ${txt}`); } else { score -= 12; cons.push(`Track record: ${txt}`); }
      }
    }

    const vela = data.velaScore;
    if (vela?.finalScore != null) {
      if (vela.finalScore >= 70) { score += 18; pros.push(`Vela quality score ${vela.finalScore}/100 — strong overall.`); }
      else if (vela.finalScore < 50) { score -= 18; cons.push(`Vela quality score ${vela.finalScore}/100 — weak overall.`); }
      else pros.push(`Vela quality score ${vela.finalScore}/100 — average.`);
    }
    if (vela?.riskLabel) {
      const rl = String(vela.riskLabel).toLowerCase();
      if (rl.includes("high")) cons.push(`Risk profile: ${rl} — expect larger swings.`);
      else pros.push(`Risk profile: ${rl}.`);
    }
    if (data.ratings?.morningstarOverall != null) {
      const st = data.ratings.morningstarOverall;
      if (st >= 4) { score += 10; pros.push(`Morningstar rating ${st}/5.`); }
      else if (st <= 2) { score -= 10; cons.push(`Morningstar rating ${st}/5.`); }
    }

    return { score, pros, cons };
  }, [data, bars]);

  const verdict =
    read.score >= 40 ? "BUY" :
    read.score >= 15 ? "ACCUMULATE" :
    read.score > -15 ? "HOLD" :
    read.score > -40 ? "TRIM" : "AVOID";

  const tone =
    verdict === "BUY" || verdict === "ACCUMULATE" ? "text-success border-success/40 bg-success/5" :
    verdict === "HOLD" ? "text-muted-foreground" : "text-destructive border-destructive/40 bg-destructive/5";

  const action =
    verdict === "BUY" ? "Cost, quality and trend all line up. A reasonable core holding, sized to your plan." :
    verdict === "ACCUMULATE" ? "Constructive overall. Build the position gradually rather than in one go." :
    verdict === "HOLD" ? "Mixed picture. Keep what you have and look at cheaper or better-rated alternatives before adding." :
    verdict === "TRIM" ? "Cost or performance is working against you. Reduce and compare with the alternatives below." :
    "Several negatives align — cheaper, better-rated vehicles with the same exposure are likely available.";

  const compositeLabel =
    read.score >= 40 ? "Strong overall profile"
    : read.score >= 15 ? "Favourable profile"
    : read.score > -15 ? "Neutral profile"
    : read.score > -40 ? "Weak profile" : "Poor profile";

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>{showVerdicts ? "What to do" : "Composite read-out"}</CardTitle>
            <CardDescription>
              {showVerdicts
                ? "Blended read from cost, scale, track record, quality score and price trend."
                : "Descriptive blend of cost, scale, track record, quality score and price trend. Educational only."}
            </CardDescription>
          </div>
        </div>
        <Badge variant="outline" className={`px-3 py-1 text-base ${showVerdicts ? tone : ""}`}>
          {showVerdicts ? verdict : compositeLabel}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">
          {showVerdicts
            ? action
            : `Composite ${read.score >= 0 ? "+" : ""}${read.score} (${compositeLabel.toLowerCase()}). Educational read-out only; no recommendation issued.`}
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-success">What works in its favour</p>
            {read.pros.length ? (
              <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {read.pros.slice(0, 5).map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No clear positives in the published data.</p>}
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-destructive">What to watch out for</p>
            {read.cons.length ? (
              <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {read.cons.slice(0, 5).map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No material red flags in the published data.</p>}
          </div>
        </div>
        <p className="text-xs italic text-muted-foreground">
          Educational signal — not investment advice. Always confirm with your own research and risk rules.
        </p>
      </CardContent>
    </Card>
  );
};
