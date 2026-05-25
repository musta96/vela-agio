import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { Receipt, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/** Jurisdictions we apply ruleset-aware tax math for. */
const JURISDICTIONS = [
  { code: "IT", name: "Italy", capitalGainsRate: 0.26, currency: "EUR", note: "Capital gains: 26%. Losses carry forward 4 years (Art. 68 TUIR)." },
  { code: "FR", name: "France", capitalGainsRate: 0.30, currency: "EUR", note: "Flat tax (PFU) 30% on gains; losses offset gains for 10 years." },
  { code: "DE", name: "Germany", capitalGainsRate: 0.26375, currency: "EUR", note: "Abgeltungsteuer 25% + Soli 5.5%. €1,000 sparer-pauschbetrag." },
  { code: "ES", name: "Spain", capitalGainsRate: 0.23, currency: "EUR", note: "Progressive 19-28%; default 23%. 2-month wash-sale rule." },
  { code: "NL", name: "Netherlands", capitalGainsRate: 0.36, currency: "EUR", note: "Box 3 wealth tax — no harvesting in classic sense." },
  { code: "GB", name: "United Kingdom", capitalGainsRate: 0.20, currency: "GBP", note: "CGT 10/20%; £3,000 annual allowance; 30-day bed-and-breakfast rule." },
  { code: "CH", name: "Switzerland", capitalGainsRate: 0, currency: "CHF", note: "Private capital gains generally tax-free for non-professional investors." },
  { code: "US", name: "United States", capitalGainsRate: 0.20, currency: "USD", note: "Short ≤1y at ordinary rates; long-term 0/15/20%. 30-day wash-sale rule." },
  { code: "CA", name: "Canada", capitalGainsRate: 0.25, currency: "CAD", note: "50% inclusion at marginal rate; 30-day superficial-loss rule." },
  { code: "AU", name: "Australia", capitalGainsRate: 0.225, currency: "AUD", note: "50% CGT discount if held >12 months." },
  { code: "SG", name: "Singapore", capitalGainsRate: 0, currency: "SGD", note: "No capital gains tax on personal investments." },
  { code: "AE", name: "UAE", capitalGainsRate: 0, currency: "AED", note: "No personal capital gains tax." },
  { code: "PT", name: "Portugal", capitalGainsRate: 0.28, currency: "EUR", note: "Flat 28% (or progressive if elected). NHR regime may apply." },
  { code: "OTHER", name: "Other / not listed", capitalGainsRate: 0.20, currency: "EUR", note: "Default 20% placeholder — please consult a local tax advisor." },
];

export default function TaxHarvest() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [holdings, setHoldings] = useState<any[]>([]);
  const [residence, setResidence] = useState<string>("IT");
  const [taxResidence, setTaxResidence] = useState<string>("IT");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("portfolio_holdings").select("*").eq("user_id", user.id).then(({ data }) => setHoldings(data ?? []));
    supabase.from("profiles").select("country_residence, country_tax_residence").eq("user_id", user.id).maybeSingle().then(({ data }: any) => {
      if (data?.country_residence) setResidence(data.country_residence);
      if (data?.country_tax_residence) setTaxResidence(data.country_tax_residence);
    });
  }, [user]);

  const jur = JURISDICTIONS.find(j => j.code === taxResidence) ?? JURISDICTIONS[0];

  const saveResidency = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      country_residence: residence,
      country_tax_residence: taxResidence,
    } as any).eq("user_id", user.id);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Tax residency saved");
  };

  const symbols = holdings.map(h => h.symbol);
  const { quotes } = useLiveQuotes(symbols, 60_000);

  const candidates = holdings.map(h => {
    const q = quotes[h.symbol];
    if (!q) return null;
    const cost = h.shares * h.avg_price; const mkt = h.shares * q.price;
    const pnl = mkt - cost; const pnlPct = cost ? (pnl / cost) * 100 : 0;
    return { ...h, price: q.price, cost, mkt, pnl, pnlPct };
  }).filter(Boolean).sort((a: any, b: any) => a.pnl - b.pnl);

  const losers = candidates.filter((x: any) => x.pnl < 0);
  const totalLoss = losers.reduce((s: number, x: any) => s + x.pnl, 0);
  const taxBenefit = -totalLoss * jur.capitalGainsRate;
  const sym = jur.currency === "EUR" ? "€" : jur.currency === "GBP" ? "£" : jur.currency === "USD" ? "$" : jur.currency + " ";

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Tax-Loss Harvesting | Vela.ai" description="Realise losses to offset capital gains" path="/tax-harvest" />
      <TopNav />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3"><Receipt className="h-6 w-6 text-primary" /><h1 className="text-3xl font-bold">{t("pages.taxHarvest.title")}</h1></div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />Tax residency</CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-3 gap-4 items-end">
            <div>
              <Label className="text-xs">Country of residence</Label>
              <Select value={residence} onValueChange={setResidence}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{JURISDICTIONS.map(j => <SelectItem key={j.code} value={j.code}>{j.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Country of tax residence</Label>
              <Select value={taxResidence} onValueChange={setTaxResidence}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{JURISDICTIONS.map(j => <SelectItem key={j.code} value={j.code}>{j.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={saveResidency} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            <p className="text-xs text-muted-foreground sm:col-span-3 -mt-2">{jur.note}</p>
          </CardContent>
        </Card>

        <Card><CardContent className="p-6 grid md:grid-cols-3 gap-4">
          <div><div className="text-sm text-muted-foreground">{t("pages.taxHarvest.unrealised")}</div><div className="text-2xl font-mono text-bear">{sym}{totalLoss.toFixed(0)}</div></div>
          <div><div className="text-sm text-muted-foreground">{t("pages.taxHarvest.benefit")} ({(jur.capitalGainsRate * 100).toFixed(1)}%)</div><div className="text-2xl font-mono text-bull">{sym}{taxBenefit.toFixed(0)}</div></div>
          <div><div className="text-sm text-muted-foreground">{t("pages.taxHarvest.eligible")}</div><div className="text-2xl font-mono">{losers.length}</div></div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>{t("pages.taxHarvest.candidates")}</CardTitle></CardHeader><CardContent className="space-y-2">
          {losers.map((x: any) => (
            <div key={x.symbol} className="flex items-center justify-between border-b pb-2">
              <div><div className="font-semibold">{x.symbol}</div><div className="text-xs text-muted-foreground">{x.name}</div></div>
              <div className="flex items-center gap-4 text-sm font-mono">
                <span>Cost {sym}{x.cost.toFixed(0)}</span>
                <span>Mkt {sym}{x.mkt.toFixed(0)}</span>
                <Badge variant="destructive">{x.pnlPct.toFixed(1)}%</Badge>
              </div>
            </div>
          ))}
          {!losers.length && <p className="text-muted-foreground">{t("pages.taxHarvest.none")}</p>}
        </CardContent></Card>
        <p className="text-xs text-muted-foreground">{t("pages.taxHarvest.footer")} {t("common.notFinancialAdvice")}</p>
      </main>
    </div>
  );
}