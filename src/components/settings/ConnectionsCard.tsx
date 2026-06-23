import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API_KEY_SPECS, vaultList, vaultSet, vaultDelete, type StoredKeyMeta } from "@/lib/userApiKeys";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Key, Trash2, Loader2, ExternalLink, Sparkles } from "lucide-react";
import { VaultHealthCard } from "./VaultHealthCard";

const AI_PROVIDERS = [
  { value: "lovable", label: "Lovable AI Gateway (default)" },
  { value: "openai", label: "OpenAI (your key)" },
  { value: "anthropic", label: "Anthropic Claude (your key)" },
  { value: "gemini", label: "Google Gemini (your key)" },
  { value: "openrouter", label: "OpenRouter (your key)" },
  { value: "perplexity", label: "Perplexity (your key)" },
  { value: "mistral", label: "Mistral (your key)" },
  { value: "groq", label: "Groq (your key)" },
];

// Per-provider model catalogue. "auto" = the resolver picks the cheapest
// model that fits the requested task (server-side). Add new models here when
// providers ship them; the server falls back to its default if the picked
// model is unsupported.
const AI_MODELS: Record<string, { value: string; label: string }[]> = {
  lovable: [
    { value: "", label: "Auto · cheapest that fits the task" },
    { value: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite (fastest, cheapest)" },
    { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (default, balanced)" },
    { value: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash (fast reasoning)" },
    { value: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (strongest reasoning)" },
    { value: "openai/gpt-5-nano", label: "GPT-5 Nano (fast, low cost)" },
    { value: "openai/gpt-5-mini", label: "GPT-5 Mini (balanced)" },
    { value: "openai/gpt-5", label: "GPT-5 (premium)" },
    { value: "openai/gpt-5.5", label: "GPT-5.5 (top reasoning)" },
    { value: "openai/gpt-5.5-pro", label: "GPT-5.5 Pro (premium reasoning)" },
  ],
  openai: [
    { value: "", label: "Auto · cheapest that fits the task" },
    { value: "gpt-5-nano", label: "gpt-5-nano (cheapest)" },
    { value: "gpt-5-mini", label: "gpt-5-mini (balanced)" },
    { value: "gpt-5", label: "gpt-5" },
    { value: "gpt-5.4", label: "gpt-5.4 (advanced reasoning)" },
    { value: "gpt-5.5", label: "gpt-5.5 (premium)" },
  ],
  anthropic: [
    { value: "", label: "Auto · cheapest that fits the task" },
    { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 (cheapest)" },
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (balanced)" },
    { value: "claude-opus-4-8", label: "Claude Opus 4.8 (premium)" },
  ],
  gemini: [
    { value: "", label: "Auto · cheapest that fits the task" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-3-flash-preview", label: "Gemini 3 Flash (preview)" },
    { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite" },
    { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
    { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)" },
  ],
  openrouter: [
    { value: "", label: "Auto · cheapest that fits the task" },
    { value: "openai/gpt-5-mini", label: "OpenAI GPT-5 Mini" },
    { value: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { value: "anthropic/claude-opus-4-8", label: "Claude Opus 4.8" },
    { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (preview)" },
  ],
  perplexity: [
    { value: "", label: "Auto · cheapest that fits the task" },
    { value: "llama-3.1-sonar-small-128k-online", label: "Sonar Small (online)" },
    { value: "llama-3.1-sonar-large-128k-online", label: "Sonar Large (online, default)" },
    { value: "llama-3.1-sonar-huge-128k-online", label: "Sonar Huge (online)" },
  ],
  mistral: [
    { value: "", label: "Auto · cheapest that fits the task" },
    { value: "mistral-small-latest", label: "Mistral Small" },
    { value: "mistral-large-latest", label: "Mistral Large" },
    { value: "codestral-latest", label: "Codestral" },
  ],
  groq: [
    { value: "", label: "Auto · cheapest that fits the task" },
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B (instant)" },
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (versatile, default)" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
  ],
};

// Map provider → required key id (matches API_KEY_SPECS ids)
const PROVIDER_KEY_ID: Record<string, string | null> = {
  lovable: null,
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  mistral: "MISTRAL_API_KEY",
  groq: "GROQ_API_KEY",
};

export function ConnectionsCard() {
  const { user } = useAuth();
  const [stored, setStored] = useState<StoredKeyMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiProvider, setAiProvider] = useState("lovable");
  const [aiModel, setAiModel] = useState("");
  const [category, setCategory] = useState<"ai" | "market" | "social">("ai");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: prof }, keys] = await Promise.all([
      supabase.from("profiles").select("ai_provider, ai_model").eq("user_id", user.id).maybeSingle(),
      vaultList().catch(() => []),
    ]);
    if (prof) { setAiProvider(prof.ai_provider || "lovable"); setAiModel(prof.ai_model || ""); }
    setStored(keys);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  const saveProvider = async () => {
    if (!user) return;
    const { error } = await supabase.from("profiles").upsert(
      { user_id: user.id, ai_provider: aiProvider, ai_model: aiModel || null },
      { onConflict: "user_id" },
    );
    if (error) toast.error("Could not save", { description: error.message });
    else toast.success("AI provider updated");
  };

  // Reset the model selection when the provider changes so the dropdown
  // never shows a value that doesn't belong to the new provider's list.
  useEffect(() => {
    const allowed = (AI_MODELS[aiProvider] ?? []).some((m) => m.value === aiModel);
    if (!allowed) setAiModel("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiProvider]);

  const requiredKey = PROVIDER_KEY_ID[aiProvider];
  const hasRequiredKey = !requiredKey || stored.some((k) => k.provider === requiredKey);

  const setKey = async (provider: string) => {
    const value = draft[provider]?.trim();
    if (!value) return;
    setSaving(provider);
    try {
      await vaultSet(provider, value);
      setDraft((d) => ({ ...d, [provider]: "" }));
      toast.success("Key saved");
      load();
    } catch (e) {
      toast.error("Failed to save key", { description: (e as Error).message });
    } finally { setSaving(null); }
  };

  const removeKey = async (provider: string) => {
    try { await vaultDelete(provider); toast.success("Key removed"); load(); }
    catch (e) { toast.error("Failed to remove key", { description: (e as Error).message }); }
  };

  const specs = API_KEY_SPECS.filter((s) => s.category === category);
  const hintFor = (id: string) => stored.find((k) => k.provider === id);

  return (
    <div className="space-y-6">
      <VaultHealthCard />
      <Card className="p-6 rounded-2xl">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">AI provider</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Lovable's gateway works out of the box. To use your own account (and your own quota), pick a provider and add the key below.
        </p>
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Provider</label>
            <Select value={aiProvider} onValueChange={setAiProvider}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AI_PROVIDERS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Default model</label>
            <Select value={aiModel || "__auto__"} onValueChange={(v) => setAiModel(v === "__auto__" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(AI_MODELS[aiProvider] ?? AI_MODELS.lovable).map((m) => (
                  <SelectItem key={m.value || "__auto__"} value={m.value || "__auto__"}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={saveProvider} disabled={loading}>Save</Button>
        </div>
        {requiredKey && !hasRequiredKey && (
          <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2 mt-3">
            No <span className="font-mono">{requiredKey}</span> saved. Add it under "AI" in the keys list below or AI calls will fall back to Lovable AI Gateway.
          </p>
        )}
      </Card>

      <Card className="p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">External data & API keys</h2>
          </div>
          <div className="flex gap-1 rounded-full border border-border p-1 text-xs">
            {(["ai", "market", "social"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3 py-1 rounded-full capitalize ${category === c ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                {c === "market" ? "Market data" : c === "social" ? "News & social" : "AI"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Keys are encrypted at rest by Lovable Cloud. We only ever show you the last 4 characters as a hint. Includes Seeking Alpha, Morningstar-style providers, Bloomberg-alternatives, and more.
        </p>

        {loading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading keys…</div>
        ) : (
          <ul className="divide-y divide-border">
            {specs.map((spec) => {
              const meta = hintFor(spec.id);
              return (
                <li key={spec.id} className="py-3 grid sm:grid-cols-[1.2fr_1fr_auto] gap-3 items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{spec.label}</span>
                      {meta && <Badge variant="outline" className="text-[10px] font-mono">••••{meta.hint}</Badge>}
                      {spec.signupUrl && (
                        <a href={spec.signupUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{spec.description}</p>
                  </div>
                  <Input
                    type="password"
                    placeholder={meta ? "Replace key…" : "Paste key…"}
                    value={draft[spec.id] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [spec.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") setKey(spec.id); }}
                  />
                  <div className="flex gap-1.5 justify-end">
                    <Button size="sm" onClick={() => setKey(spec.id)} disabled={!draft[spec.id]?.trim() || saving === spec.id}>
                      {saving === spec.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                    </Button>
                    {meta && (
                      <Button size="sm" variant="outline" className="text-destructive border-destructive/30" onClick={() => removeKey(spec.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}