import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Sparkles } from "lucide-react";

const TIERS = [
  { name: "Free", price: "€0", note: "Forever", features: ["Live quotes (delayed)", "Watchlist (5 symbols)", "Basic charts & news", "AI sentiment on top names", "Community"], cta: "Start free" },
  { name: "Pro", price: "€29", note: "/ month", highlight: true, features: ["Unlimited watchlists & portfolios", "Real-time intraday & VWAP", "Full AI Copilot & deep research", "Backtesting & optimizer", "Tax-loss harvesting", "Email & push alerts", "PDF reports"], cta: "Upgrade to Pro" },
  { name: "Advisor", price: "€199", note: "/ seat / month", features: ["Everything in Pro", "MiFID II suitability + KIDs", "Client portal (white-label)", "Model portfolios", "Compliance audit log", "Priority support"], cta: "Contact sales" },
  { name: "Enterprise", price: "Custom", note: "+ API & SSO", features: ["REST API + webhooks", "SSO (SAML / OIDC)", "SOC 2 / ISO 27001 docs", "Dedicated SLA", "On-prem option", "Custom data feeds"], cta: "Talk to us" },
];

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background">
      <SEO title="Pricing | FTSE MIB Analytics" description="Tiered plans from free to enterprise" path="/pricing" />
      <TopNav />
      <main className="container mx-auto px-6 py-10 space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold flex items-center justify-center gap-2"><Sparkles className="h-8 w-8 text-primary" /> Plans for every investor</h1>
          <p className="text-muted-foreground mt-2">From curious consumers to institutional desks. Cancel anytime.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {TIERS.map(t => (
            <Card key={t.name} className={t.highlight ? "border-primary ring-2 ring-primary/40" : ""}>
              <CardHeader>
                <CardTitle className="flex items-baseline justify-between">
                  <span>{t.name}</span>
                  {t.highlight && <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">Popular</span>}
                </CardTitle>
                <div className="text-3xl font-bold">{t.price}<span className="text-sm font-normal text-muted-foreground"> {t.note}</span></div>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1 text-sm">
                  {t.features.map(f => (
                    <li key={f} className="flex gap-2"><Check className="h-4 w-4 text-bull mt-0.5 shrink-0" /><span>{f}</span></li>
                  ))}
                </ul>
                <Button className="w-full" variant={t.highlight ? "default" : "outline"}>{t.cta}</Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">All plans include GDPR DPA. SOC 2 Type II and ISO 27001 on enterprise roadmap.</p>
      </main>
    </div>
  );
}