import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import VelaLogo from "@/components/VelaLogo";
import { Users, ArrowRight, Loader2 } from "lucide-react";
import { SEO } from "@/components/SEO";
import { friendVisitSession, saveFriendInvite, validInviteToken } from "@/lib/friendInvites";

export default function FriendInvite() {
  const { token = "" } = useParams();
  const { user, loading } = useAuth();
  const { i18n } = useTranslation(); const it = i18n.language.startsWith("it");
  const copy = (en: string, italian: string) => it ? italian : en;
  const [status, setStatus] = useState<"loading" | "ready" | "invalid" | "error">("loading");
  const started = useRef("");
  const capture = async () => {
    if (!validInviteToken(token)) { setStatus("invalid"); return; }
    if (user) { setStatus("ready"); return; }
    setStatus("loading");
    const { data, error } = await supabase.rpc("record_friend_invite_visit", { _token: token, _browser_session: friendVisitSession() });
    if (error) { setStatus("error"); return; }
    if (!data) { setStatus("invalid"); return; }
    saveFriendInvite(data); setStatus("ready");
  };
  useEffect(() => {
    if (loading || started.current === token) return;
    started.current = token; void capture();
  }, [token, loading, user?.id]);
  return <main className="grid min-h-screen place-items-center bg-background px-4 py-12 text-foreground">
    <SEO title="Join a friend on Vela" description="Explore investment research and portfolio tracking with Vela." path="/invite" />
    <div className="w-full max-w-lg space-y-6 text-center">
      <Link className="inline-flex" to="/" aria-label="Vela"><VelaLogo size={36} /></Link>
      <Users className="mx-auto h-10 w-10 text-primary" />
      <h1 className="text-3xl font-semibold">{copy("A friend invited you to Vela", "Un amico ti ha invitato su Vela")}</h1>
      <p className="text-muted-foreground">{copy("Research investments, follow your holdings and explore strategies. Start with a free Explorer account.", "Analizza investimenti, segui il tuo portafoglio ed esplora strategie. Inizia con un account Explorer gratuito.")}</p>
      {status === "loading" && <p role="status" className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{copy("Checking invitation…", "Verifica invito…")}</p>}
      {status === "error" && <><p role="alert" className="text-destructive">{copy("We couldn't check this invitation. Please try again.", "Non siamo riusciti a verificare l'invito. Riprova.")}</p><Button variant="outline" onClick={() => void capture()}>{copy("Try again", "Riprova")}</Button></>}
      {status === "invalid" && <p role="alert" className="text-muted-foreground">{copy("This invitation is unavailable. You can still create a free account.", "Questo invito non è disponibile. Puoi comunque creare un account gratuito.")}</p>}
      {status !== "loading" && status !== "error" && <Button asChild className="gap-2"><Link to={user ? "/dashboard" : "/auth?tab=signup"}>{user ? copy("Open Vela", "Apri Vela") : copy("Create a free account", "Crea un account gratuito")}<ArrowRight className="h-4 w-4" /></Link></Button>}
      <p className="text-xs text-muted-foreground">{copy("Invitations do not include a discount or paid access. Only aggregate visit and signup counts are shared with your friend.", "Gli inviti non includono sconti o accesso a pagamento. Il tuo amico vede solo conteggi aggregati di visite e iscrizioni.")}</p>
      <div className="flex justify-center gap-5 text-xs text-muted-foreground"><Link to="/privacy">Privacy</Link><Link to="/terms">{copy("Terms", "Termini")}</Link></div>
    </div>
  </main>;
}