import { useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Shield } from "lucide-react";

const Q = [
  { key: "horizon", q: "Investment horizon", opts: ["< 1y (1)", "1-3y (2)", "3-7y (3)", "7y+ (4)"] },
  { key: "knowledge", q: "Investment knowledge", opts: ["None (1)", "Basic (2)", "Good (3)", "Expert (4)"] },
  { key: "experience", q: "Experience with complex products", opts: ["None (1)", "Funds (2)", "Stocks/ETFs (3)", "Derivatives (4)"] },
  { key: "loss", q: "Tolerance for a 20% drawdown", opts: ["Sell all (1)", "Worry, hold (2)", "Hold calmly (3)", "Buy more (4)"] },
  { key: "income", q: "Liquid savings vs annual income", opts: ["<3m (1)", "3-6m (2)", "6-12m (3)", "12m+ (4)"] },
  { key: "goal", q: "Primary objective", opts: ["Capital preservation (1)", "Income (2)", "Balanced growth (3)", "Aggressive growth (4)"] },
];

const PROFILES = [
  { min: 0, max: 10, name: "Conservative", desc: "Capital preservation, low volatility", allocation: "20/70/10 equities/bonds/cash" },
  { min: 11, max: 14, name: "Moderate", desc: "Balanced growth with controlled risk", allocation: "50/45/5" },
  { min: 15, max: 19, name: "Growth", desc: "Long-term capital appreciation", allocation: "70/25/5" },
  { min: 20, max: 24, name: "Aggressive", desc: "Maximum growth, high volatility tolerance", allocation: "90/8/2 with thematic tilts" },
];

export default function Suitability() {
  const [ans, setAns] = useState<Record<string, number>>({});
  const [done, setDone] = useState(false);

  const score = Object.values(ans).reduce((a, b) => a + b, 0);
  const profile = PROFILES.find(p => score >= p.min && score <= p.max);

  if (done && profile) {
    return (
      <div className="min-h-screen bg-background">
        <SEO title="MiFID II Suitability | FTSE MIB Analytics" description="Suitability assessment & KID-style summary" path="/suitability" />
        <TopNav />
        <main className="container mx-auto px-6 py-8 max-w-3xl space-y-6">
          <div className="flex items-center gap-3"><Shield className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">Suitability Result</h1></div>
          <Card>
            <CardHeader><CardTitle>Investor Profile: {profile.name}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><span className="text-muted-foreground">Score:</span> <span className="font-mono">{score} / 24</span></div>
              <div><span className="text-muted-foreground">Description:</span> {profile.desc}</div>
              <div><span className="text-muted-foreground">Suggested allocation:</span> <span className="font-mono">{profile.allocation}</span></div>
              <div className="border-t pt-3 mt-3 text-xs text-muted-foreground">
                <strong>KID-style summary:</strong> This assessment is generated under a MiFID II-inspired suitability framework. It is informational only and does not constitute investment advice. Final allocation must be reviewed against your specific goals, tax situation, and regulatory environment. SRI risk indicator (1-7): {Math.min(7, Math.max(1, Math.round(score / 3.5)))}.
              </div>
              <Button variant="outline" onClick={() => { setDone(false); setAns({}); }}>Retake</Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO title="MiFID II Suitability | FTSE MIB Analytics" description="Suitability assessment" path="/suitability" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 max-w-3xl space-y-6">
        <div className="flex items-center gap-3"><Shield className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">MiFID II Suitability Assessment</h1></div>
        {Q.map(qq => (
          <Card key={qq.key}>
            <CardHeader className="pb-2"><CardTitle className="text-base">{qq.q}</CardTitle></CardHeader>
            <CardContent>
              <RadioGroup value={String(ans[qq.key] ?? "")} onValueChange={(v) => setAns({ ...ans, [qq.key]: Number(v) })}>
                {qq.opts.map((o, i) => (
                  <div key={i} className="flex items-center gap-2 py-1">
                    <RadioGroupItem id={`${qq.key}-${i}`} value={String(i + 1)} />
                    <Label htmlFor={`${qq.key}-${i}`} className="cursor-pointer">{o}</Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>
        ))}
        <Button onClick={() => setDone(true)} disabled={Object.keys(ans).length < Q.length}>Calculate profile</Button>
      </main>
    </div>
  );
}