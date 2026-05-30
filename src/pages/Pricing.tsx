import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Gift } from "lucide-react";
import { useFlag } from "@/hooks/useFeatureFlags";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";
import { useAuth } from "@/hooks/useAuth";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { ManageSubscriptionButton } from "@/components/ManageSubscriptionButton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";

type Tier = {
  name: string;
  price: string;
  note: string;
  highlight?: boolean;
  features: string[];
  cta: string;
  priceId?: string;
};
const TIERS: Tier[] = [
  { name: "Free", price: "€0", note: "Forever", features: ["Live quotes (delayed)", "Watchlist (5 symbols)", "Basic charts & news", "AI sentiment on top names", "Community"], cta: "Start free" },
  { name: "Pro", price: "€19", note: "/ month", highlight: true, priceId: "pro_monthly", features: ["Unlimited watchlists & portfolios", "Real-time intraday & VWAP", "AI Copilot & deep research", "Email & push alerts", "PDF reports"], cta: "Upgrade to Pro" },
  { name: "Elite", price: "€49", note: "/ month", priceId: "elite_monthly", features: ["Everything in Pro", "AI portfolio coach", "Backtesting & optimizer", "Tax-loss harvesting", "Priority data feeds"], cta: "Upgrade to Elite" },
  { name: "Family", price: "€79", note: "/ month", priceId: "family_monthly", features: ["Elite for up to 4 members", "Shared watchlists & portfolios", "Family billing", "Premium support"], cta: "Get Family" },
];

export default function Pricing() {
  const pricingEnabled = useFlag("pricing", false);
  const { openCheckout, closeCheckout, isOpen, checkoutElement } = useStripeCheckout();
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleCta = (tier: Tier) => {
    if (!tier.priceId) {
      navigate("/auth");
      return;
    }
    if (!user) { navigate("/auth"); return; }
    openCheckout({
      priceId: tier.priceId,
      customerEmail: user.email,
      userId: user.id,
      returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    });
  };

  if (!pricingEnabled) {
    return (
      <div className="min-h-screen bg-background">
        <SEO title="Free for everyone | Vela.ai" description="The platform is currently free for everyone." path="/pricing" />
        <TopNav />
        <main className="container mx-auto px-6 py-20 text-center max-w-2xl">
          <Gift className="h-14 w-14 mx-auto text-primary mb-4" />
          <h1 className="text-4xl font-bold">Free for everyone</h1>
          <p className="text-muted-foreground mt-3">
            Every feature — AI research, optimizer, intraday data, alerts, reports — is currently free
            for all users. No paid tiers, no limits.
          </p>
          <Button asChild className="mt-6"><a href="/">Start exploring</a></Button>
        </main>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background">
      <SEO title="Pricing | Vela.ai" description="Tiered plans from free to enterprise" path="/pricing" />
      <PaymentTestModeBanner />
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
                <Button className="w-full" variant={t.highlight ? "default" : "outline"} onClick={() => handleCta(t)}>{t.cta}</Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">All plans include GDPR DPA. SOC 2 Type II and ISO 27001 on enterprise roadmap.</p>
        {user && (
          <div className="text-center pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground mb-3">Already subscribed?</p>
            <ManageSubscriptionButton variant="outline" size="sm" />
          </div>
        )}
      </main>
      <Dialog open={isOpen} onOpenChange={(o) => !o && closeCheckout()}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <div className="max-h-[85vh] overflow-y-auto">{checkoutElement}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}