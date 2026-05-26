import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Eye, EyeOff, Save, Trash2, ExternalLink, ShieldCheck, KeyRound, Brain, LineChart, MessageSquare, CheckCircle2, Loader2, LogOut, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TopNav } from "@/components/TopNav";
import { SEO } from "@/components/SEO";
import { useToast } from "@/hooks/use-toast";
import { API_KEY_SPECS, vaultList, vaultSet, vaultDelete, type ApiKeyCategory, type ApiKeySpec, type StoredKeyMeta } from "@/lib/userApiKeys";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cpu } from "lucide-react";

type ProviderId = "lovable" | "openai" | "groq" | "mistral" | "perplexity" | "anthropic" | "gemini";

const PROVIDER_OPTIONS: Array<{ id: ProviderId; label: string; defaultModel: string; needsKey?: string; models: string[]; status?: "beta" | "soon" }> = [
  { id: "lovable", label: "Lovable AI (default, no key needed)", defaultModel: "google/gemini-2.5-flash",
    models: ["google/gemini-2.5-flash", "google/gemini-2.5-pro", "google/gemini-2.5-flash-lite", "google/gemini-3-flash-preview", "openai/gpt-5-mini", "openai/gpt-5"] },
  { id: "openai", label: "OpenAI", defaultModel: "gpt-4o-mini", needsKey: "OPENAI_API_KEY",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "gpt-4.1-mini", "o3-mini", "o4-mini"] },
  { id: "groq", label: "Groq (ultra-fast Llama/Mixtral)", defaultModel: "llama-3.3-70b-versatile", needsKey: "GROQ_API_KEY",
    models: ["llama-3.3-70b-versatile", "llama-3.1-70b-versatile", "mixtral-8x7b-32768", "gemma2-9b-it"] },
  { id: "mistral", label: "Mistral", defaultModel: "mistral-large-latest", needsKey: "MISTRAL_API_KEY",
    models: ["mistral-large-latest", "mistral-small-latest", "codestral-latest"] },
  { id: "perplexity", label: "Perplexity (online search)", defaultModel: "llama-3.1-sonar-large-128k-online", needsKey: "PERPLEXITY_API_KEY",
    models: ["llama-3.1-sonar-large-128k-online", "llama-3.1-sonar-small-128k-online"] },
  { id: "anthropic", label: "Anthropic (Claude) — coming soon", defaultModel: "claude-3-5-sonnet-latest", needsKey: "ANTHROPIC_API_KEY",
    models: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest"], status: "soon" },
  { id: "gemini", label: "Google Gemini (direct) — coming soon", defaultModel: "gemini-2.0-flash", needsKey: "GEMINI_API_KEY",
    models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"], status: "soon" },
];

const CATEGORY_META: Record<ApiKeyCategory, { label: string; icon: typeof Brain; description: string }> = {
  ai: { label: "AI Models", icon: Brain, description: "Bring your own LLM providers for chat, analysis and recommendations." },
  market: { label: "Market Data & Brokers", icon: LineChart, description: "Premium fundamentals, intraday feeds and trading APIs." },
  social: { label: "Social & News", icon: MessageSquare, description: "Authenticated access for richer sentiment scraping." },
};

const KeyRow = ({
  spec,
  savedHint,
  onSave,
  onClear,
}: {
  spec: ApiKeySpec;
  savedHint: string | null;
  onSave: (v: string) => Promise<void>;
  onClear: () => Promise<void>;
}) => {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = value.length > 0;

  return (
    <div className="p-4 rounded-lg border border-border/60 bg-card/40 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Label className="text-sm font-semibold">{spec.label}</Label>
            {savedHint && (
              <Badge variant="outline" className="gap-1 text-success border-success/30">
                <CheckCircle2 className="h-3 w-3" /> Saved · ••••{savedHint}
              </Badge>
            )}
            {spec.serverOnly && (
              <Badge variant="outline" className="gap-1 text-primary border-primary/30">
                <ShieldCheck className="h-3 w-3" /> Server-side
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{spec.description}</p>
        </div>
        {spec.signupUrl && (
          <a
            href={spec.signupUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary inline-flex items-center gap-1 hover:underline shrink-0"
          >
            Get key <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            type={show ? "text" : "password"}
            placeholder={savedHint ? `•••• ${savedHint} (encrypted)` : `Paste your ${spec.label} key`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="pr-10 font-mono text-xs"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={show ? "Hide key" : "Show key"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button
          size="sm"
          disabled={!dirty || busy}
          onClick={async () => {
            setBusy(true);
            try { await onSave(value.trim()); setValue(""); } finally { setBusy(false); }
          }}
          className="gap-1"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
        </Button>
        {savedHint && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={async () => { setBusy(true); try { await onClear(); } finally { setBusy(false); } }}
            className="gap-1 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
};

const Settings = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [hints, setHints] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [focus, setFocus] = useState("");
  const [focusSaving, setFocusSaving] = useState(false);
  const [focusLoaded, setFocusLoaded] = useState(false);
  const [aiProvider, setAiProvider] = useState<ProviderId>("lovable");
  const [aiModel, setAiModel] = useState<string>("");
  const [aiSaving, setAiSaving] = useState(false);
  const [aiLoaded, setAiLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any).from("profiles").select("briefing_focus, ai_provider, ai_model").eq("user_id", user.id).maybeSingle();
      setFocus(data?.briefing_focus ?? "");
      setFocusLoaded(true);
      setAiProvider((data?.ai_provider ?? "lovable") as ProviderId);
      setAiModel(data?.ai_model ?? "");
      setAiLoaded(true);
    })();
  }, [user]);

  const saveFocus = async () => {
    if (!user) return;
    setFocusSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ briefing_focus: focus.trim() || null })
        .eq("user_id", user.id);
      if (error) throw error;
      toast({ title: "Briefing focus saved", description: "Your next dashboard briefing will reflect this." });
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setFocusSaving(false);
    }
  };

  const refresh = async () => {
    try {
      const list: StoredKeyMeta[] = await vaultList();
      const map: Record<string, string> = {};
      for (const k of list) map[k.provider] = k.hint;
      setHints(map);
    } catch (e) {
      toast({ title: "Couldn't load saved keys", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const grouped = useMemo(() => {
    const out: Record<ApiKeyCategory, ApiKeySpec[]> = { ai: [], market: [], social: [] };
    API_KEY_SPECS.forEach((s) => out[s.category].push(s));
    return out;
  }, []);

  const handleSave = async (id: string, value: string) => {
    try {
      await vaultSet(id, value);
      await refresh();
      toast({ title: "Key encrypted & saved", description: id });
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    }
  };
  const handleClear = async (id: string) => {
    try {
      await vaultDelete(id);
      await refresh();
      toast({ title: "Key removed", description: id });
    } catch (e) {
      toast({ title: "Remove failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const signOutEverywhere = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut({ scope: "global" });
      toast({ title: "Signed out on all devices" });
      window.location.href = "/auth";
    } catch (e) {
      toast({ title: "Sign-out failed", description: (e as Error).message, variant: "destructive" });
      setSigningOut(false);
    }
  };

  const savedCount = Object.keys(hints).length;

  const saveAi = async () => {
    if (!user) return;
    setAiSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ ai_provider: aiProvider, ai_model: aiModel.trim() || null })
        .eq("user_id", user.id);
      if (error) throw error;
      toast({ title: "AI provider updated", description: `Now using ${aiProvider}${aiModel ? ` · ${aiModel}` : ""}` });
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setAiSaving(false);
    }
  };

  const activeProvider = PROVIDER_OPTIONS.find(p => p.id === aiProvider) ?? PROVIDER_OPTIONS[0];
  const needsKey = activeProvider.needsKey;
  const keyMissing = !!needsKey && !hints[needsKey];

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Settings — Account, Preferences & Integrations" description="Manage your account, preferences, notification settings, and connected integrations for Vela.ai." path="/settings" />
      <TopNav />
      <main>

      <div className="container mx-auto px-6 py-8 max-w-5xl">
        <PageHeader
          icon={KeyRound}
          title="Settings & Connectors"
          description={
            <>
              Plug your own AI providers, market-data vendors and social/news APIs. Keys are AES-GCM encrypted server-side; only the last 4 characters are visible to your browser.
              {savedCount > 0 && <> · <span className="text-success">{savedCount} key{savedCount === 1 ? "" : "s"} saved</span></>}
            </>
          }
        />

        <Alert className="mb-6 border-primary/30 bg-primary/5">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <AlertTitle>How key storage works</AlertTitle>
          <AlertDescription className="text-sm text-muted-foreground">
            Keys are encrypted with AES-GCM-256 server-side before being written to the database. The browser never receives the plaintext back — only a 4-character hint. Decryption happens inside backend functions when calling third-party APIs on your behalf. Every save / delete / reveal is recorded in the audit log.
          </AlertDescription>
        </Alert>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Security</CardTitle>
            <CardDescription>Account session controls.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={signOutEverywhere} disabled={signingOut} className="gap-2">
              {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Sign out everywhere
            </Button>
            <p className="text-xs text-muted-foreground mt-2">Invalidates all active sessions across all devices.</p>
          </CardContent>
        </Card>

        <Card className="mb-6" id="ai-provider">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Cpu className="h-5 w-5 text-primary" /> AI Model Provider</CardTitle>
            <CardDescription>
              Pick which model powers Copilot, Advisor and Deep Analysis. Default is Lovable AI (no key needed). To use OpenAI / Groq / Mistral / Perplexity, save the matching API key in the AI Models tab below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Provider</Label>
                <Select value={aiProvider} onValueChange={(v) => { setAiProvider(v as ProviderId); setAiModel(""); }} disabled={!aiLoaded}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROVIDER_OPTIONS.map(p => (
                      <SelectItem key={p.id} value={p.id} disabled={p.status === "soon"}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Model</Label>
                <Select value={aiModel || activeProvider.defaultModel} onValueChange={setAiModel} disabled={!aiLoaded}>
                  <SelectTrigger><SelectValue placeholder={activeProvider.defaultModel} /></SelectTrigger>
                  <SelectContent>
                    {activeProvider.models.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {keyMissing && (
              <Alert className="border-warning/30 bg-warning/5">
                <KeyRound className="h-4 w-4" />
                <AlertTitle>Missing key</AlertTitle>
                <AlertDescription className="text-sm">
                  <code className="text-xs">{needsKey}</code> is not saved yet. Add it in the <strong>AI Models</strong> tab below, or we'll silently fall back to Lovable AI.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground">
                Applies immediately to Copilot, Advisor and Deep Analysis. Other AI tools still use Lovable AI for now.
              </p>
              <Button size="sm" onClick={saveAi} disabled={!aiLoaded || aiSaving} className="gap-1">
                {aiSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save provider
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6" id="briefing">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-accent" /> AI Market Briefing</CardTitle>
            <CardDescription>
              Customise what your dashboard briefing focuses on. Vela.ai will always consider your portfolio and watchlist; add topics, sectors, regions, themes or tickers here to bias the narrative.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="briefing-focus" className="text-sm">Focus (free text)</Label>
            <Textarea
              id="briefing-focus"
              placeholder="e.g. EU bank earnings, AI semiconductors, ECB & Fed policy, luxury sector rotation, FTSE MIB dividend names"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              rows={3}
              disabled={!focusLoaded}
              className="resize-none"
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground">
                Leave empty for a general briefing built from your holdings and watchlist.
              </p>
              <Button size="sm" onClick={saveFocus} disabled={!focusLoaded || focusSaving} className="gap-1">
                {focusSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save focus
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="ai" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            {(Object.keys(CATEGORY_META) as ApiKeyCategory[]).map((cat) => {
              const meta = CATEGORY_META[cat];
              const Icon = meta.icon;
              const count = grouped[cat].filter((s) => hints[s.id]).length;
              return (
                <TabsTrigger key={cat} value={cat} className="gap-2">
                  <Icon className="h-4 w-4" />
                  <span>{meta.label}</span>
                  {count > 0 && <Badge variant="secondary" className="ml-1">{count}</Badge>}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {(Object.keys(CATEGORY_META) as ApiKeyCategory[]).map((cat) => {
            const meta = CATEGORY_META[cat];
            return (
              <TabsContent key={cat} value={cat}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <meta.icon className="h-5 w-5 text-primary" /> {meta.label}
                    </CardTitle>
                    <CardDescription>{meta.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
                    {!loading && grouped[cat].map((spec) => (
                      <KeyRow
                        key={spec.id}
                        spec={spec}
                        savedHint={hints[spec.id] ?? null}
                        onSave={(v) => handleSave(spec.id, v)}
                        onClear={() => handleClear(spec.id)}
                      />
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </main>
    </div>
  );
};

export default Settings;