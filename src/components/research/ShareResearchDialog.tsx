import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Share2, Copy, Link2Off, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SharePermissions {
  showCitations: boolean;
  showRecommendation: boolean;
  showRedFlags: boolean;
  showFollowUps: boolean;
  showResearchNote: boolean;
}

const DEFAULTS: SharePermissions = {
  showCitations: true,
  showRecommendation: true,
  showRedFlags: true,
  showFollowUps: true,
  showResearchNote: true,
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  note: {
    id: string;
    symbol: string;
    share_token?: string | null;
    share_enabled?: boolean | null;
    share_permissions?: any;
    share_expires_at?: string | null;
  } | null;
  onChanged?: () => void;
}

export function ShareResearchDialog({ open, onOpenChange, note, onChanged }: Props) {
  const [perms, setPerms] = useState<SharePermissions>(DEFAULTS);
  const [expiresInDays, setExpiresInDays] = useState<string>("30");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !note) return;
    setToken(note.share_token ?? null);
    setEnabled(!!note.share_enabled);
    setExpiresAt(note.share_expires_at ?? null);
    const p = (note.share_permissions ?? {}) as Partial<SharePermissions>;
    setPerms({ ...DEFAULTS, ...p });
  }, [open, note]);

  const shareUrl = token ? `${window.location.origin}/research/shared/${token}` : "";

  const createOrUpdate = async () => {
    if (!note) return;
    setBusy(true);
    try {
      const days = expiresInDays === "" ? null : Math.max(0, parseInt(expiresInDays, 10));
      const { data, error } = await supabase.functions.invoke("equity-research-analyst", {
        body: {
          action: "share_create",
          id: note.id,
          symbol: note.symbol,
          permissions: perms,
          expiresInDays: Number.isFinite(days) ? days : null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      setToken(data.token);
      setEnabled(true);
      setExpiresAt(data.expiresAt ?? null);
      toast.success("Share link ready");
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create share link");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!note) return;
    if (!confirm("Revoke this share link? Anyone with the URL will lose access.")) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("equity-research-analyst", {
        body: { action: "share_revoke", id: note.id, symbol: note.symbol },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      setEnabled(false);
      toast.success("Share link revoked");
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || "Failed to revoke");
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    toast.success("Link copied");
  };

  const PermRow = ({ k, label, hint }: { k: keyof SharePermissions; label: string; hint?: string }) => (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="flex-1">
        <Label className="text-sm">{label}</Label>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={perms[k]} onCheckedChange={(v) => setPerms((p) => ({ ...p, [k]: v }))} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-primary" /> Share research note
            {note && <Badge variant="outline">{note.symbol}</Badge>}
          </DialogTitle>
          <DialogDescription>
            Create a read-only link. Anyone with the URL can view only the sections you enable — no sign-in required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 rounded-md border border-border/60 p-3 bg-muted/20">
          <PermRow k="showResearchNote" label="Research note & summary" hint="Executive summary, business overview, capital allocation." />
          <PermRow k="showCitations" label="Inline citations" hint="Show extracted quotes and SEC section labels." />
          <PermRow k="showRecommendation" label="Recommendation & stance" hint="Portfolio-manager stance and rationale." />
          <PermRow k="showRedFlags" label="Red flags" />
          <PermRow k="showFollowUps" label="Follow-up questions for management" />
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="exp" className="text-xs">Expires in (days)</Label>
            <Input
              id="exp"
              type="number"
              min={0}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              placeholder="Leave empty for no expiry"
            />
            {expiresAt && enabled && (
              <p className="text-[11px] text-muted-foreground mt-1">Current link expires {new Date(expiresAt).toLocaleString()}</p>
            )}
          </div>
          <Button onClick={createOrUpdate} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Share2 className="h-3 w-3 mr-1" />}
            {enabled && token ? "Update link" : "Create link"}
          </Button>
        </div>

        {enabled && token && (
          <div className="space-y-2 pt-2 border-t border-border/60">
            <Label className="text-xs">Shareable URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <Button size="icon" variant="outline" onClick={copy} aria-label="Copy link"><Copy className="h-3 w-3" /></Button>
              <Button size="icon" variant="outline" asChild aria-label="Open link">
                <a href={shareUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /></a>
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={revoke} disabled={busy} className="text-bear">
              <Link2Off className="h-3 w-3 mr-1" /> Revoke access
            </Button>
          </div>
        )}

        {!enabled && !token && (
          <p className="text-xs text-muted-foreground">No active share link. Create one to share this note.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}