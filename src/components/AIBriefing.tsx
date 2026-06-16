import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, RefreshCw, Settings as SettingsIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePortfolios } from "@/hooks/usePortfolios";
import { useWatchlist } from "@/hooks/useWatchlist";
import { trackAIEvent } from "@/lib/aiAnalytics";
import { newCorrelationId, CORRELATION_HEADER } from "@/lib/correlation";

interface Highlight { symbol: string; note: string; tone: "positive" | "negative" | "neutral" }
interface Briefing { headline: string; body: string; highlights?: Highlight[]; _meta?: { hasFocus?: boolean } }
interface AccessDenial { reason: string; upgrade_url?: string; byo_url?: string }
interface AccessDenialFull extends AccessDenial { tier?: string; quotaUsed?: number; quotaLimit?: number }

function parseAccessDenial(error: unknown): AccessDenialFull | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const maybeJson = message.match(/\{[\s\S]*\}$/)?.[0];
  if (!maybeJson) return null;
  try {
    const body = JSON.parse(maybeJson);
    if (body?.error === "ai_access_denied") {
      return { reason: body.reason, upgrade_url: body.upgrade_url, byo_url: body.byo_url, tier: body.tier, quotaUsed: body.quotaUsed, quotaLimit: body.quotaLimit };
    }
  } catch { /* ignore */ }
  return null;
}

// Render minimal **bold** markdown without bringing in a dep.
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i} className="text-[hsl(var(--sidebar-foreground))]">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
}

export function AIBriefing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { active } = usePortfolios();
  const { items: watchlist } = useWatchlist();
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState<AccessDenialFull | null>(null);

  // Centralise denial state + analytics so every code path logs identically.
  const handleDenial = useCallback((d: AccessDenialFull, origin: string) => {
    const correlationId = (d as any).correlationId ?? null;
    // eslint-disable-next-line no-console
    console.warn("[ai-briefing] ai_access_denied", { correlationId, origin, ...d });
    setDenied(d);
    trackAIEvent("ai_access_denied_shown", {
      origin, correlationId,
      tier: d.tier, quotaUsed: d.quotaUsed, quotaLimit: d.quotaLimit, reason: d.reason,
    });
  }, []);
  const [focus, setFocus] = useState<string>("");

  // Load user's saved focus
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any).from("profiles").select("briefing_focus").eq("user_id", user.id).maybeSingle();
      if (data?.briefing_focus) setFocus(data.briefing_focus);
    })();
  }, [user]);

  const generate = useCallback(async () => {
    if (!user || !active) return;
    setLoading(true);
    setError(null);
    setDenied(null);
    const correlationId = newCorrelationId();
    // eslint-disable-next-line no-console
    console.info("[ai-briefing] request", { correlationId, hasFocus: !!focus });
    trackAIEvent("ai_briefing_request", { hasFocus: !!focus, correlationId });
    try {
      const { data: holdingsData } = await (supabase as any)
        .from("portfolio_holdings")
        .select("symbol,name,shares,avg_price")
        .eq("portfolio_id", active.id);
      const holdings = holdingsData ?? [];
      const { data, error } = await supabase.functions.invoke("market-briefing", {
        body: {
          holdings,
          watchlist: watchlist.map((w) => ({ symbol: w.symbol, name: w.name })),
          focus,
          lang: "en",
          correlationId,
        },
        headers: { [CORRELATION_HEADER]: correlationId },
      });
      // Edge function returns 402 with a JSON body when AI access is denied.
      if (error) {
        const denialFromMessage = parseAccessDenial(error);
        if (denialFromMessage) {
          handleDenial({ ...denialFromMessage, correlationId } as any, "error.message");
          return;
        }
        let body: any = null;
        try { body = await (error as any)?.context?.json?.(); } catch { /* ignore */ }
        if (body?.error === "ai_access_denied") {
          handleDenial({ reason: body.reason, upgrade_url: body.upgrade_url, byo_url: body.byo_url, tier: body.tier, quotaUsed: body.quotaUsed, quotaLimit: body.quotaLimit, correlationId: body.correlationId ?? correlationId } as any, "error.context");
          return;
        }
        throw error;
      }
      if (data?.error === "ai_access_denied") {
        handleDenial({ reason: data.reason, upgrade_url: data.upgrade_url, byo_url: data.byo_url, tier: data.tier, quotaUsed: data.quotaUsed, quotaLimit: data.quotaLimit, correlationId: data.correlationId ?? correlationId } as any, "200_body");
        return;
      }
      if (data?.error) throw new Error(data.error);
      setBriefing(data as Briefing);
    } catch (e: any) {
      const denial = parseAccessDenial(e);
      if (denial) {
        handleDenial({ ...denial, correlationId } as any, "catch");
        return;
      }
      // eslint-disable-next-line no-console
      console.error("[ai-briefing] generate failed", { correlationId, error: e });
      trackAIEvent("ai_briefing_error", { message: e?.message ?? String(e), correlationId });
      // Never surface raw error / Edge-Function / Stream-failed text to users.
      setError("We couldn't generate your briefing right now. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  }, [user, active, watchlist, focus, handleDenial]);

  // Auto-generate once when we have an active portfolio
  useEffect(() => {
    if (user && active && !briefing && !loading && !denied && !error) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, active?.id]);

  return (
    <div className="relative overflow-hidden rounded-2xl glass-card-strong gradient-hero glow-primary p-5 sm:p-6 text-[hsl(var(--sidebar-foreground))]">
      <div className="pointer-events-none absolute inset-0 gradient-accent opacity-[0.06]" aria-hidden />
      <div className="relative flex gap-4">
        <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl gradient-accent text-white shadow-[var(--glow-primary)]">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
              Vela AI · Market briefing {briefing?._meta?.hasFocus && <span className="ml-2 text-[hsl(var(--sidebar-foreground))]/50">· focused</span>}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={generate}
                disabled={loading || !user || !active}
                className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--sidebar-foreground))]/80 hover:bg-white/15 inline-flex items-center gap-1 disabled:opacity-50"
                title="Refresh briefing"
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Refresh
              </button>
              <button
                onClick={() => navigate("/settings?tab=briefing")}
                className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--sidebar-foreground))]/80 hover:bg-white/15 inline-flex items-center gap-1"
                title="Customise focus"
              >
                <SettingsIcon className="h-3 w-3" /> Focus
              </button>
            </div>
          </div>

          {!user && (
            <p className="mt-2 text-[13px] text-[hsl(var(--sidebar-foreground))]/70">
              Sign in to receive a personalised briefing based on your portfolio and watchlist.
            </p>
          )}

          {user && loading && !briefing && (
            <p className="mt-2 text-[13px] text-[hsl(var(--sidebar-foreground))]/70 inline-flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analysing your portfolio & watchlist…
            </p>
          )}

          {error && (
            <p className="mt-2 text-[13px] text-destructive-foreground/90">{error}</p>
          )}

          {denied && (
            <div className="mt-2">
              <p className="text-[13px] text-[hsl(var(--sidebar-foreground))]/80">{denied.reason}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    trackAIEvent("ai_upgrade_cta_clicked", { url: denied.upgrade_url || "/pricing", tier: denied.tier, correlationId: (denied as any).correlationId });
                    navigate(denied.upgrade_url || "/pricing");
                  }}
                  className="rounded-full bg-accent px-3 py-1.5 text-[11px] font-medium text-accent-foreground hover:opacity-90"
                >Upgrade plan</button>
                <button
                  onClick={() => {
                    trackAIEvent("ai_byo_cta_clicked", { url: denied.byo_url || "/settings#ai", tier: denied.tier, correlationId: (denied as any).correlationId });
                    navigate(denied.byo_url || "/settings#ai");
                  }}
                  className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-medium text-[hsl(var(--sidebar-foreground))]/80 hover:bg-white/15"
                >Use my own API key</button>
              </div>
            </div>
          )}

          {briefing && (
            <>
              {briefing.headline && (
                <p className="mt-2 text-[13px] font-medium text-[hsl(var(--sidebar-foreground))]">{briefing.headline}</p>
              )}
              {briefing.body && (
                <p className="mt-1.5 text-[13px] leading-relaxed text-[hsl(var(--sidebar-foreground))]/85">
                  {renderInline(briefing.body)}
                </p>
              )}
              {!!briefing.highlights?.length && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {briefing.highlights.map((h, i) => {
                    const cls = h.tone === "positive" ? "bg-success/15 text-success border-success/30"
                      : h.tone === "negative" ? "bg-destructive/20 text-destructive-foreground border-destructive/30"
                      : "bg-white/10 text-[hsl(var(--sidebar-foreground))]/80 border-white/15";
                    return (
                      <button
                        key={i}
                        onClick={() => navigate(`/stock/${encodeURIComponent(h.symbol)}`)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] ${cls} hover:opacity-90`}
                      >
                        <span className="font-mono font-semibold">{h.symbol}</span> · {h.note}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {briefing && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => navigate("/picks")} className="rounded-full bg-accent px-3 py-1.5 text-[11px] font-medium text-accent-foreground hover:opacity-90">View setups</button>
              <button onClick={() => navigate("/advisor")} className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-medium text-[hsl(var(--sidebar-foreground))]/80 hover:bg-white/15">Full briefing</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}