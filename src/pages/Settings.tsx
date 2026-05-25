import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Eye, EyeOff, Save, Trash2, ExternalLink, ShieldAlert, KeyRound, Brain, LineChart, MessageSquare, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { NavLink } from "@/components/NavLink";
import { useToast } from "@/hooks/use-toast";
import { API_KEY_SPECS, loadApiKeys, saveApiKey, type ApiKeyCategory, type ApiKeySpec } from "@/lib/userApiKeys";

const CATEGORY_META: Record<ApiKeyCategory, { label: string; icon: typeof Brain; description: string }> = {
  ai: { label: "AI Models", icon: Brain, description: "Bring your own LLM providers for chat, analysis and recommendations." },
  market: { label: "Market Data & Brokers", icon: LineChart, description: "Premium fundamentals, intraday feeds and trading APIs." },
  social: { label: "Social & News", icon: MessageSquare, description: "Authenticated access for richer sentiment scraping." },
};

const KeyRow = ({
  spec,
  initial,
  onSave,
  onClear,
}: {
  spec: ApiKeySpec;
  initial: string;
  onSave: (v: string) => void;
  onClear: () => void;
}) => {
  const [value, setValue] = useState(initial);
  const [show, setShow] = useState(false);
  const dirty = value !== initial;

  useEffect(() => setValue(initial), [initial]);

  return (
    <div className="p-4 rounded-lg border border-border/60 bg-card/40 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Label className="text-sm font-semibold">{spec.label}</Label>
            {initial && (
              <Badge variant="outline" className="gap-1 text-success border-success/30">
                <CheckCircle2 className="h-3 w-3" /> Saved
              </Badge>
            )}
            {spec.serverOnly && (
              <Badge variant="outline" className="gap-1 text-amber-500 border-amber-500/30">
                <ShieldAlert className="h-3 w-3" /> Server-side recommended
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
            placeholder={initial ? "•••••••• (stored)" : `Paste your ${spec.label} key`}
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
        <Button size="sm" disabled={!dirty} onClick={() => onSave(value.trim())} className="gap-1">
          <Save className="h-3.5 w-3.5" /> Save
        </Button>
        {initial && (
          <Button size="sm" variant="ghost" onClick={onClear} className="gap-1 text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
};

const Settings = () => {
  const { toast } = useToast();
  const [keys, setKeys] = useState<Record<string, string>>({});

  useEffect(() => setKeys(loadApiKeys()), []);

  const grouped = useMemo(() => {
    const out: Record<ApiKeyCategory, ApiKeySpec[]> = { ai: [], market: [], social: [] };
    API_KEY_SPECS.forEach((s) => out[s.category].push(s));
    return out;
  }, []);

  const handleSave = (id: string, value: string) => {
    saveApiKey(id, value);
    setKeys(loadApiKeys());
    toast({ title: value ? "Key saved" : "Key cleared", description: id });
  };

  const savedCount = Object.values(keys).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <Activity className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold text-gradient">FTSE MIB Analytics</span>
          </Link>
          <div className="flex items-center space-x-6">
            <NavLink to="/" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Dashboard</NavLink>
            <NavLink to="/sentiment" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Sentiment</NavLink>
            <NavLink to="/picks" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">AI Picks</NavLink>
            <NavLink to="/portfolio" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Portfolio</NavLink>
            <NavLink to="/settings" className="text-sm font-medium text-foreground" activeClassName="text-primary">Settings</NavLink>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-6 py-8 max-w-5xl">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <KeyRound className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold">Settings & Connectors</h1>
          </div>
          <p className="text-muted-foreground">
            Plug your own AI providers, market-data vendors and social/news APIs.
            {savedCount > 0 && <> · <span className="text-success">{savedCount} key{savedCount === 1 ? "" : "s"} saved</span></>}
          </p>
        </div>

        <Alert className="mb-6 border-amber-500/30 bg-amber-500/5">
          <ShieldAlert className="h-4 w-4 text-amber-500" />
          <AlertTitle>How key storage works</AlertTitle>
          <AlertDescription className="text-sm text-muted-foreground">
            Keys you enter here are stored <strong>only in this browser</strong> (localStorage) and used by the frontend to enrich requests.
            For production-grade secrecy and use from server-side AI calls, the same keys should also be added as backend secrets in
            Lovable Cloud (look for the &quot;Server-side recommended&quot; badge). Never share screenshots of this page.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="ai" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            {(Object.keys(CATEGORY_META) as ApiKeyCategory[]).map((cat) => {
              const meta = CATEGORY_META[cat];
              const Icon = meta.icon;
              const count = grouped[cat].filter((s) => keys[s.id]).length;
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
                    {grouped[cat].map((spec) => (
                      <KeyRow
                        key={spec.id}
                        spec={spec}
                        initial={keys[spec.id] || ""}
                        onSave={(v) => handleSave(spec.id, v)}
                        onClear={() => handleSave(spec.id, "")}
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