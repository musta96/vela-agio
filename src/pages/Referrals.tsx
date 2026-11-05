import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/PageHeader";
import { Users, Copy, Share2, RefreshCw, Loader2, Check } from "lucide-react";
import { referralConversion } from "@/lib/friendInvites";
type Stats = { token: string; visits: number; signups: number; confirmed: number };
export default function Referrals() {
  const { i18n } = useTranslation(); const it = i18n.language.startsWith("it");
  const copy = (en: string, italian: string) => it ? italian : en;
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [copied, setCopied] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error } = await supabase.rpc("my_friend_invite");
    if (error) setError(copy("Your invitation could not be loaded. Try again.", "Non è stato possibile caricare l'invito. Riprova."));
    else setStats(data as unknown as Stats);
    setLoading(false);
  }, [it]);
  useEffect(() => { void load(); }, [load]);
  const url = stats ? `https://vela-agio.lovable.app/invite/${stats.token}` : "";
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { setError(copy("Select and copy the link below.", "Seleziona e copia il link qui sotto.")); }
  };
  const share = async () => {
    try { if (navigator.share) await navigator.share({ title: "Vela", text: copy("Join me on Vela", "Unisciti a me su Vela"), url }); else await copyLink(); }
    catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) setError(copy("Sharing failed. Copy the link instead.", "Condivisione non riuscita. Copia il link.")); }
  };
  return <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
    <PageHeader icon={Users} title={copy("Invite friends", "Invita amici")} description={copy("Share Vela with people you know.", "Condividi Vela con le persone che conosci.")} actions={<Button variant="outline" size="icon" disabled={loading} title={copy("Refresh", "Aggiorna")} aria-label={copy("Refresh", "Aggiorna")} onClick={() => void load()}><RefreshCw className="h-4 w-4" /></Button>} />
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {loading && !stats ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />{copy("Loading your invitation…", "Caricamento invito…")}</p> : stats && <>
      <section className="border-y border-border py-6"><Label htmlFor="friend-link">{copy("Your personal invitation link", "Il tuo link personale")}</Label>
        <div className="mt-2 flex flex-wrap gap-2"><Input id="friend-link" readOnly value={url} className="min-w-0 flex-1 basis-64" onFocus={e => e.target.select()} /><Button variant="outline" onClick={() => void copyLink()} className="gap-2">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? copy("Copied", "Copiato") : copy("Copy", "Copia")}</Button><Button onClick={() => void share()} className="gap-2"><Share2 className="h-4 w-4" />{copy("Share", "Condividi")}</Button></div>
      </section>
      <section aria-label={copy("Referral results", "Risultati inviti")} className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        {[{ label: copy("Tracked visits", "Visite tracciate"), value: stats.visits }, { label: copy("Accounts created", "Account creati"), value: stats.signups }, { label: copy("Confirmed signups", "Iscrizioni confermate"), value: stats.confirmed }, { label: copy("Visit → signup", "Visita → iscrizione"), value: `${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(referralConversion(stats.visits, stats.signups))}%` }].map(m => <div key={m.label}><p className="text-sm text-muted-foreground">{m.label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{m.value}</p></div>)}
      </section>
      <p className="border-t border-border pt-5 text-sm leading-relaxed text-muted-foreground">{copy("Repeat opens in the same browser tab count once per invite. These are tracked visit sessions, not verified unique people. Only new accounts created after a visit are attributed, within 30 days; one account and one signup per visit. Existing members and self-invites do not count. Email confirmation is tracked separately. No discounts or paid features are granted.", "Le aperture ripetute nella stessa scheda contano una volta per invito. Sono sessioni di visita tracciate, non persone uniche verificate. Sono attribuiti solo nuovi account creati dopo la visita, entro 30 giorni: un account e un'iscrizione per visita. Utenti esistenti e auto-inviti non contano. La conferma email è conteggiata separatamente. Non sono concessi sconti o funzionalità a pagamento.")}</p>
    </>}
  </div>;
}