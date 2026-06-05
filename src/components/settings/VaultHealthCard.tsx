import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, RefreshCw, Copy, KeyRound, Loader2 } from "lucide-react";
import { vaultHealth, generateEncryptionKey, type VaultHealth } from "@/lib/userApiKeys";
import { toast } from "sonner";

export function VaultHealthCard() {
  const [health, setHealth] = useState<VaultHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [generated, setGenerated] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    try { setHealth(await vaultHealth()); }
    catch (e) { toast.error("Health check failed", { description: (e as Error).message }); }
    finally { setLoading(false); }
  };
  useEffect(() => { run(); }, []);

  const ok = !!health?.ok;
  const enc = health?.encryption_key;

  const generate = () => {
    const k = generateEncryptionKey();
    setGenerated(k);
  };
  const copy = async (v: string) => {
    try { await navigator.clipboard.writeText(v); toast.success("Copied to clipboard"); }
    catch { toast.error("Copy failed — select and copy manually"); }
  };

  return (
    <Card className="p-6 rounded-2xl">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          {ok ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <ShieldAlert className="h-4 w-4 text-amber-600" />}
          <h2 className="text-base font-semibold">Key vault health</h2>
          {health && (
            <Badge variant={ok ? "outline" : "destructive"} className="text-[10px]">
              {ok ? "All checks passed" : "Setup required"}
            </Badge>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={run} disabled={loading} className="gap-1">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Re-check
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Verifies that the encryption key and required backend secrets are present and valid before you save any API keys.
      </p>

      {enc && (
        <div className={`rounded-lg border p-3 text-sm mb-3 ${enc.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}`}>
          <div className="font-medium">APP_ENCRYPTION_KEY</div>
          <div className="text-xs text-muted-foreground mt-0.5">{enc.message}</div>
          {!enc.ok && (
            <div className="text-[11px] font-mono text-muted-foreground mt-1">
              present={String(enc.present)} · base64_valid={String(enc.base64_valid)} · bytes={enc.byte_length}/{enc.expected_byte_length}
            </div>
          )}
        </div>
      )}

      {health?.secrets && (
        <ul className="grid sm:grid-cols-2 gap-2 mb-4">
          {health.secrets.map((s) => (
            <li key={s.name} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-xs">
              <span className="font-mono">{s.name}</span>
              <Badge variant={s.present ? "outline" : "destructive"} className="text-[10px]">
                {s.present ? "present" : "missing"}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="h-3.5 w-3.5" />
          <span className="text-sm font-medium">Generate a valid APP_ENCRYPTION_KEY</span>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          Creates a fresh 32-byte AES-256 key, base64-encoded, in your browser. Copy it, then paste into your Lovable Cloud secret named <code className="font-mono">APP_ENCRYPTION_KEY</code>. Rotating this key invalidates previously stored API keys.
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <Button size="sm" variant="outline" onClick={generate} className="gap-1">
            <KeyRound className="h-3 w-3" /> Generate
          </Button>
          {generated && (
            <>
              <code className="text-[11px] font-mono px-2 py-1 rounded bg-muted break-all flex-1 min-w-[200px]">{generated}</code>
              <Button size="sm" variant="ghost" onClick={() => copy(generated)} className="gap-1">
                <Copy className="h-3 w-3" /> Copy
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}