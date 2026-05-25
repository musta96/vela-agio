import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Eye, EyeOff, Save, Trash2, ExternalLink, ShieldCheck, KeyRound, Brain, LineChart, MessageSquare, CheckCircle2, Loader2, LogOut } from "lucide-react";
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
  const [hints, setHints] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

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

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Settings — Account, Preferences & Integrations" description="Manage your account, preferences, notification settings, and connected integrations for FTSE MIB Analytics." path="/settings" />
      <TopNav />

      <div className="container mx-auto px-6 py-8 max-w-5xl">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <KeyRound className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold">Settings & Connectors</h1>
          </div>
          <p className="text-muted-foreground">
            Plug your own AI providers, market-data vendors and social/news APIs. Keys are AES-GCM encrypted server-side; only the last 4 characters are visible to your browser.
            {savedCount > 0 && <> · <span className="text-success">{savedCount} key{savedCount === 1 ? "" : "s"} saved</span></>}
          </p>
        </div>

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
    </div>
  );
};

export default Settings;