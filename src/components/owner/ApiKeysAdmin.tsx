import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { KeyRound, Trash2 } from "lucide-react";

type ApiKey = { id: string; user_id: string; provider: string; hint: string | null; created_at: string; updated_at: string };
type User = { id: string; email: string };

export function ApiKeysAdmin({ apiKeys, users, reload }: { apiKeys: ApiKey[]; users: User[]; reload: () => void }) {
  const [q, setQ] = useState("");
  const userById: Record<string, User> = {};
  users.forEach(u => { userById[u.id] = u; });
  const filtered = apiKeys.filter(k => {
    if (!q) return true;
    const email = userById[k.user_id]?.email?.toLowerCase() || "";
    return email.includes(q.toLowerCase()) || k.provider.toLowerCase().includes(q.toLowerCase());
  });

  const revoke = async (id: string, email: string, provider: string) => {
    if (!confirm(`Revoke the ${provider} key for ${email}? This cannot be undone.`)) return;
    const { data, error } = await supabase.functions.invoke("owner-console", { body: { action: "apikey_revoke", id } });
    if (error || (data as any)?.error) { toast.error((data as any)?.error || error?.message || "Failed"); return; }
    toast.success("Key revoked"); reload();
  };

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <h3 className="font-semibold flex items-center gap-2"><KeyRound className="h-4 w-4" /> User-stored API keys</h3>
        <p className="text-xs text-muted-foreground">Keys (e.g. external AI providers, broker tokens) are stored encrypted. You can see who has one and revoke it - you cannot read the secret.</p>
      </Card>
      <Card className="p-3">
        <Input placeholder="Filter by email or provider…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
      </Card>
      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead>User</TableHead><TableHead>Provider</TableHead><TableHead>Hint</TableHead>
            <TableHead>Added</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((k) => {
              const u = userById[k.user_id];
              return (
                <TableRow key={k.id}>
                  <TableCell className="text-sm">{u?.email || <span className="font-mono text-xs text-muted-foreground">{k.user_id.slice(0, 8)}</span>}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{k.provider}</Badge></TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{k.hint || "-"}</TableCell>
                  <TableCell className="text-[10px] text-muted-foreground">{new Date(k.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" className="text-destructive gap-1" onClick={() => revoke(k.id, u?.email || k.user_id, k.provider)}>
                      <Trash2 className="h-3.5 w-3.5" /> Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10 text-sm">No user API keys stored.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}