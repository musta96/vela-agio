import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw, CreditCard, ExternalLink, Check } from "lucide-react";
import { ApplePackage, Purchases, withAppleAccount, verifyApplePurchase, applePurchaseError, clearAppleAccount } from "@/lib/applePurchases";
import { supabase } from "@/integrations/supabase/client";

export function AppleSubscriptionPanel() {
  const { user } = useAuth();
  const ent = useEntitlements();
  const { i18n } = useTranslation();
  const it = i18n.language.startsWith("it");
  const copy = (en: string, italian: string) => it ? italian : en;
  const [packages, setPackages] = useState<ApplePackage[]>([]);
  const [cycle, setCycle] = useState("monthly");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [verified, setVerified] = useState<{ active: boolean; expiresAt: string | null; willRenew: boolean; hasPaidAccess: boolean; provider: string | null } | null>(null);
  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true); setMessage(null);
    try {
      const status = await verifyApplePurchase();
      setVerified(status);
      const offerings = await withAppleAccount(user.id, () => Purchases.getOfferings());
      setPackages((offerings.current?.availablePackages ?? []).filter(p =>
        (p.product.identifier === "vela_pro_monthly" && p.product.subscriptionPeriod === "P1M") ||
        (p.product.identifier === "vela_pro_yearly" && p.product.subscriptionPeriod === "P1Y")));
    } catch (error) { setMessage(applePurchaseError(error).message); }
    finally { setLoading(false); }
  }, [user?.id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") void clearAppleAccount();
    });
    return () => subscription.unsubscribe();
  }, []);
  const selected = packages.find(p => p.product.identifier === (cycle === "monthly" ? "vela_pro_monthly" : "vela_pro_yearly"));
  const hasPaidAccess = verified?.hasPaidAccess || ent.source === "subscription";
  const run = async (restore: boolean) => {
    if (!user) return;
    setBusy(true); setMessage(null);
    try {
      await withAppleAccount(user.id, async () => {
        if (restore) await Purchases.restorePurchases();
        else {
          // Recheck on the server immediately before asking Apple to charge.
          const current = await verifyApplePurchase();
          if (current.hasPaidAccess) throw new Error(copy("Your account already has a paid subscription. Manage your existing subscription instead.", "Il tuo account ha già un abbonamento a pagamento. Gestisci quello esistente."));
          if (!selected) throw new Error(copy("This subscription is not available.", "Questo abbonamento non è disponibile."));
          await Purchases.purchasePackage({ aPackage: selected });
        }
      });
      const status = await verifyApplePurchase();
      setVerified(status);
      await ent.refresh();
      setMessage(status.active ? copy("Your Apple subscription is verified. Your paid features are available.", "Abbonamento Apple verificato. Le funzionalità del piano sono disponibili.") : copy("No active Apple subscription was found. If payment is pending, try Restore purchases after approval.", "Nessun abbonamento Apple attivo trovato. Se il pagamento è in attesa, riprova dopo l'approvazione."));
    } catch (error) { const result = applePurchaseError(error); if (!result.cancelled) setMessage(result.message); }
    finally { setBusy(false); }
  };
  return <section className="min-w-0 space-y-4" aria-label={copy("Apple subscription", "Abbonamento Apple")}>
    <div><h2 className="text-xl font-semibold">Vela Pro</h2><p className="mt-1 text-sm text-muted-foreground">{copy("Strategy research and advanced backtesting", "Ricerca sulle strategie e backtest avanzati")}</p></div>
    <ul className="space-y-2 text-sm">
      {[copy("Strategy Lab, previews and walk-forward tests", "Strategy Lab, anteprime e test walk-forward"), copy("Advanced backtests, trading costs and event tests", "Backtest avanzati, costi di negoziazione e test sugli eventi"), copy("Portfolio optimizer and risk tools", "Ottimizzazione del portafoglio e strumenti di rischio"), copy("2,000 hosted AI requests per calendar month", "2.000 richieste AI per mese solare")].map(label => <li key={label} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary"/>{label}</li>)}
    </ul>
    {loading ? <div role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin"/>{copy("Checking subscription…", "Verifica abbonamento…")}</div> : hasPaidAccess ?
      <p className="text-sm">{copy("Your account already includes paid features. No additional subscription is needed.", "Il tuo account include già le funzionalità a pagamento. Non serve un altro abbonamento.")}</p> : <>
        <Tabs value={cycle} onValueChange={setCycle}><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="monthly">{copy("Monthly", "Mensile")}</TabsTrigger><TabsTrigger value="yearly">{copy("Yearly", "Annuale")}</TabsTrigger></TabsList></Tabs>
        {selected ? <p className="text-lg font-semibold">{selected.product.priceString} <span className="text-sm font-normal text-muted-foreground">/ {cycle === "monthly" ? copy("month", "mese") : copy("year", "anno")}</span></p> : <p className="text-sm text-muted-foreground">{copy("Apple subscriptions are currently unavailable.", "Gli abbonamenti Apple non sono attualmente disponibili.")}</p>}
        <Button className="w-full gap-2" disabled={busy || !selected || !verified} onClick={() => void run(false)}>{busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <CreditCard className="h-4 w-4"/>}{copy("Subscribe with Apple", "Abbonati con Apple")}</Button>
      </>}
    {verified?.active && verified.expiresAt && <p className="text-sm text-muted-foreground">{verified.willRenew ? copy("Renews on ", "Si rinnova il ") : copy("Access ends on ", "Accesso fino al ")}{new Date(verified.expiresAt).toLocaleDateString(i18n.language)}</p>}
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" className="gap-2" disabled={busy || loading || !user} onClick={() => void run(true)}><RefreshCw className="h-4 w-4"/>{copy("Restore purchases", "Ripristina acquisti")}</Button>
      <Button variant="ghost" className="gap-2" disabled={busy || loading} onClick={() => void load()}><RefreshCw className="h-4 w-4"/>{copy("Refresh", "Aggiorna")}</Button>
      {verified?.provider === "apple" && <Button variant="outline" className="gap-2" asChild><a href="https://apps.apple.com/account/subscriptions" target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4"/>{copy("Manage subscription", "Gestisci abbonamento")}</a></Button>}
    </div>
    {hasPaidAccess && verified?.provider !== "apple" && <p className="text-sm text-muted-foreground">{copy("Your existing subscription is managed with its original payment provider.", "Il tuo abbonamento esistente è gestito dal fornitore di pagamento originale.")}</p>}
    <p className="text-xs leading-relaxed text-muted-foreground">{copy("Payment is charged to your Apple Account at confirmation. Subscriptions renew automatically unless cancelled at least 24 hours before the period ends. Manage or cancel in Apple subscription settings. Cancellation keeps access until the paid period ends. Apple's confirmation shows the final price and terms.", "Il pagamento viene addebitato all'account Apple alla conferma. L'abbonamento si rinnova automaticamente salvo annullamento almeno 24 ore prima della scadenza. Gestisci o annulla nelle impostazioni abbonamenti Apple. L'accesso resta attivo fino alla fine del periodo pagato. La conferma Apple mostra prezzo e condizioni finali.")}</p>
    <div className="flex gap-4 text-xs text-muted-foreground"><Link className="underline" to="/terms">{copy("Terms of use", "Termini di utilizzo")}</Link><Link className="underline" to="/privacy">Privacy</Link><Link className="underline" to="/support">{copy("Support", "Assistenza")}</Link></div>
  </section>;
}