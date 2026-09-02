import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Loader2, Copy, Trash2, UserPlus } from "lucide-react";

type Member = {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  email: string | null;
  plan: string;
  subscription_status: string | null;
};
type Invitation = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};
type Firm = { id: string; name: string; seat_limit: number; owner_user_id: string };

const ROLES = ["firm_admin", "advisor", "analyst", "viewer"];

export default function EnterpriseTeams() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [firm, setFirm] = useState<Firm | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [plan, setPlan] = useState<string>("explorer");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("advisor");
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("manage-enterprise-team", {
      body: { action: "get_team" },
    });
    setLoading(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Could not load the team.");
      return;
    }
    setFirm((data as any).firm ?? null);
    setMembers((data as any).members ?? []);
    setInvitations((data as any).invitations ?? []);
    setIsOwner(Boolean((data as any).is_owner));
    setPlan(String((data as any).plan ?? "explorer"));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function call(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("manage-enterprise-team", {
      body: { action, ...payload },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Something went wrong.");
      return null;
    }
    return data as any;
  }

  const pendingInvites = invitations.filter((i) => !i.accepted_at && new Date(i.expires_at) > new Date());
  const seatsUsed = members.length + pendingInvites.length;
  const seatLimit = firm?.seat_limit ?? 3;

  async function invite() {
    const res = await call("invite", { email, role });
    if (!res) return;
    setEmail("");
    setLastInviteLink(`${window.location.origin}/join-team?token=${res.token}`);
    toast.success("Invitation created. Copy the link and send it to your advisor.");
    load();
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading team…
      </div>
    );
  }

  if (!firm) {
    return (
      <Card className="p-6 space-y-2">
        <div className="flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4" /> No firm yet</div>
        <p className="text-sm text-muted-foreground">
          Team management is part of Enterprise. Once an Enterprise subscription is active, a firm is created
          automatically and advisor seats can be invited from here. Current plan: <Badge variant="outline">{plan}</Badge>
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">{firm.name}</h2>
              {isOwner && <Badge variant="outline" className="text-[10px]">Firm admin</Badge>}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {seatsUsed} of {seatLimit} seats in use ({members.length} active, {pendingInvites.length} pending)
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={busy}>Refresh</Button>
        </div>
      </Card>

      {isOwner && (
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-sm"><UserPlus className="h-4 w-4" /> Invite an advisor</div>
          <div className="flex gap-2 flex-wrap">
            <Input
              type="email"
              placeholder="advisor@firm.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="max-w-xs"
            />
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r} value={r}>{r.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={invite} disabled={busy || !email || seatsUsed >= seatLimit}>Send invite</Button>
          </div>
          {seatsUsed >= seatLimit && (
            <p className="text-xs text-amber-500">
              All seats are in use. Remove a member or a pending invite to free one up.
            </p>
          )}
          {lastInviteLink && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2">
              <code className="text-[11px] truncate flex-1">{lastInviteLink}</code>
              <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(lastInviteLink); toast.success("Link copied"); }}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </Card>
      )}

      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-3">Seats</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Own plan</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="text-xs">{m.email ?? m.user_id.slice(0, 8)}</TableCell>
                <TableCell className="text-xs">{m.role.replace("_", " ")}</TableCell>
                <TableCell className="text-xs">
                  <Badge variant="outline" className="text-[10px]">{m.plan}</Badge>
                  {m.subscription_status && <span className="ml-1.5 text-muted-foreground">{m.subscription_status}</span>}
                </TableCell>
                <TableCell className="text-right">
                  {isOwner && m.user_id !== firm.owner_user_id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={async () => { if (await call("remove_member", { user_id: m.user_id })) load(); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {members.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">No members yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {isOwner && pendingInvites.length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-3">Pending invitations</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingInvites.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="text-xs">{i.email}</TableCell>
                  <TableCell className="text-xs">{i.role.replace("_", " ")}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(i.expires_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={async () => { if (await call("revoke_invite", { invitation_id: i.id })) load(); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
