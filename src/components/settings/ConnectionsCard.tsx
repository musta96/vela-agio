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
  { value: "perplexity", label: "Perplexity (your key)" },
  { value: "mistral", label: "Mistral (your key)" },
  { value: "groq", label: "Groq (your key)" },
];

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
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Model (optional)</label>
            <Input value={aiModel} onChange={(e) => setAiModel(e.target.value)} placeholder="e.g. gpt-5, claude-sonnet-4" />
          </div>
          <Button onClick={saveProvider} disabled={loading}>Save</Button>
        </div>
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