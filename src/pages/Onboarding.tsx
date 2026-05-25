import { useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";

const Q = [
  { q: "Investment horizon", opts: [["<3y", 1], ["3-7y", 2], ["7-15y", 3], [">15y", 4]] },
  { q: "Reaction to a 20% drawdown", opts: [["Sell all", 1], ["Sell some", 2], ["Hold", 3], ["Buy more", 4]] },
  { q: "Experience", opts: [["None", 1], ["Some ETFs", 2], ["Active investor", 3], ["Professional", 4]] },
  { q: "Income stability", opts: [["Variable", 1], ["Stable", 3], ["Very stable + savings", 4]] },
  { q: "Goal", opts: [["Capital preservation", 1], ["Income", 2], ["Balanced growth", 3], ["Aggressive growth", 4]] },
] as const;

const PORTFOLIOS = {
  conservative: { name: "Conservative", weights: { Bonds: 60, "Global Equity": 25, Gold: 10, Cash: 5 } },
  balanced: { name: "Balanced", weights: { "Global Equity": 50, Bonds: 35, "Real Estate": 10, Gold: 5 } },
  growth: { name: "Growth", weights: { "Global Equity": 70, "Emerging Markets": 15, Bonds: 10, Crypto: 5 } },
  aggressive: { name: "Aggressive", weights: { "Global Equity": 60, "Emerging Markets": 20, "Thematic / AI": 15, Crypto: 5 } },
};

export default function Onboarding() {
  const [ans, setAns] = useState<number[]>(Array(Q.length).fill(0));
  const [done, setDone] = useState(false);
  const score = ans.reduce((s, v) => s + v, 0);
  const bucket = score < 10 ? "conservative" : score < 14 ? "balanced" : score < 18 ? "growth" : "aggressive";
  const profile = PORTFOLIOS[bucket as keyof typeof PORTFOLIOS];

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Onboarding | FTSE MIB Analytics" description="Risk profile and model portfolio" path="/onboarding" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6 max-w-2xl">
        <div className="flex items-center gap-3"><Sparkles className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">Build your investor profile</h1></div>
        {!done ? (
          <>
            {Q.map((q, i) => (
              <Card key={i}><CardHeader><CardTitle className="text-base">{i + 1}. {q.q}</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">
                {q.opts.map(([label, v]) => (
                  <Button key={label as string} variant={ans[i] === v ? "default" : "outline"} size="sm" onClick={() => setAns(a => { const c = [...a]; c[i] = v as number; return c; })}>{label}</Button>
                ))}
              </CardContent></Card>
            ))}
            <Button onClick={() => setDone(true)} disabled={ans.some(v => !v)}>See my profile</Button>
          </>
        ) : (
          <Card><CardHeader><CardTitle>{profile.name} portfolio</CardTitle></CardHeader><CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Risk score: {score}/20</p>
            {Object.entries(profile.weights).map(([k, v]) => (
              <div key={k}>
                <div className="flex justify-between text-sm"><span>{k}</span><span className="font-mono">{v}%</span></div>
                <div className="h-2 bg-muted rounded"><div className="h-2 bg-primary rounded" style={{ width: `${v}%` }} /></div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-4">Indicative allocation. Not personalised financial advice.</p>
            <Button onClick={() => setDone(false)} variant="outline">Retake</Button>
          </CardContent></Card>
        )}
      </main>
    </div>
  );
}