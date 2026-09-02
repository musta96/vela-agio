import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Pencil, RefreshCcw } from "lucide-react";

type FirmRow = {
  id: string;
  name: string;
  legal_name: string | null;
  vat_number: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  notes: string | null;
  seat_limit: number;
  included_seats?: number;
  owner_user_id: string;
  owner_email: string | null;
  owner_plan: string;
  owner_status: string | null;
  members: number;
  pending_invites: number;
  created_at: string;
};

type ProfileFields = Pick<FirmRow,
  "name" | "legal_name" | "vat_number" | "contact_name" | "contact_email" |
  "contact_phone" | "website" | "address_line1" | "address_line2" | "city" |
  "postal_code" | "country" | "notes"
>;

const EMPTY_PROFILE: ProfileFields = {
  name: "", legal_name: "", vat_number: "", contact_name: "", contact_email: "",
  contact_phone: "", website: "", address_line1: "", address_line2: "", city: "",
  postal_code: "", country: "", notes: "",
};

function profileFromFirm(firm: FirmRow): ProfileFields {
  return {
    name: firm.name ?? "",
    legal_name: firm.legal_name ?? "",
    vat_number: firm.vat_number ?? "",
    contact_name: firm.contact_name ?? "",
    contact_email: firm.contact_email ?? "",
    contact_phone: firm.contact_phone ?? "",
    website: firm.website ?? "",
    address_line1: firm.address_line1 ?? "",
    address_line2: firm.address_line2 ?? "",
    city: firm.city ?? "",
    postal_code: firm.postal_code ?? "",
    country: firm.country ?? "",
    notes: firm.notes ?? "",
  };
}

export default function EnterpriseFirmsPanel() {
  const [rows, setRows] = useState<FirmRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<FirmRow | null>(null);
  const [profile, setProfile] = useState<ProfileFields>(EMPTY_PROFILE);
  const [seatLimit, setSeatLimit] = useState("3");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("manage-enterprise-team", {
      body: { action: "admin_list_firms" },
    });
    setLoading(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Could not load firms.");
      return;
    }
    setRows(((data as any).firms ?? []) as FirmRow[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openEditor(firm: FirmRow) {
    setEditing(firm);
    setProfile(profileFromFirm(firm));
    setSeatLimit(String(firm.seat_limit));
  }

  function updateField(field: keyof ProfileFields, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  async function saveProfile() {
    if (!editing) return;
    const seats = Number(seatLimit);
    if (!Number.isInteger(seats) || seats < 1 || seats > 1000) {
      toast.error("Seat limit must be a whole number between 1 and 1000.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("manage-enterprise-team", {
      body: { action: "admin_update_firm_profile", firm_id: editing.id, ...profile, seat_limit: seats },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Could not save firm profile.");
      return;
    }
    const updated = (data as any).firm as FirmRow;
    setRows((current) => current.map((firm) => firm.id === updated.id ? { ...firm, ...updated } : firm));
    setEditing(null);
    toast.success("Firm profile saved.");
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Enterprise teams</h2>
          <p className="text-sm text-muted-foreground">
            Review each firm's owner plan and seats, or update its legal, address and contact details.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading || saving}>
          <RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Firm</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Owner plan</TableHead>
              <TableHead>Seats</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Profile</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Loading…</TableCell></TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">No Enterprise firms yet.</TableCell></TableRow>
            )}
            {rows.map((firm) => {
              const used = firm.members + firm.pending_invites;
              return (
                <TableRow key={firm.id}>
                  <TableCell>
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      <Building2 className="h-3 w-3 text-muted-foreground" />{firm.name}
                    </div>
                    {firm.legal_name && <div className="text-[11px] text-muted-foreground mt-0.5">{firm.legal_name}</div>}
                  </TableCell>
                  <TableCell className="text-xs">{firm.owner_email ?? firm.owner_user_id.slice(0, 8)}</TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="text-[10px]">{firm.owner_plan}</Badge>
                    {firm.owner_status && <span className="ml-1.5 text-muted-foreground">{firm.owner_status}</span>}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {used} / {firm.seat_limit}
                    {firm.pending_invites > 0 && <span className="text-muted-foreground"> ({firm.pending_invites} pending)</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(firm.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => openEditor(firm)}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit firm profile</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="firm-name">Display name</Label><Input id="firm-name" value={profile.name} onChange={(e) => updateField("name", e.target.value)} maxLength={120} /></div>
            <div className="space-y-1.5"><Label htmlFor="legal-name">Legal name</Label><Input id="legal-name" value={profile.legal_name} onChange={(e) => updateField("legal_name", e.target.value)} maxLength={200} /></div>
            <div className="space-y-1.5"><Label htmlFor="vat-number">VAT / registration number</Label><Input id="vat-number" value={profile.vat_number} onChange={(e) => updateField("vat_number", e.target.value)} maxLength={200} /></div>
            <div className="space-y-1.5"><Label htmlFor="contact-name">Primary contact</Label><Input id="contact-name" value={profile.contact_name} onChange={(e) => updateField("contact_name", e.target.value)} maxLength={200} /></div>
            <div className="space-y-1.5"><Label htmlFor="contact-email">Contact email</Label><Input id="contact-email" type="email" value={profile.contact_email} onChange={(e) => updateField("contact_email", e.target.value)} maxLength={200} /></div>
            <div className="space-y-1.5"><Label htmlFor="contact-phone">Contact phone</Label><Input id="contact-phone" value={profile.contact_phone} onChange={(e) => updateField("contact_phone", e.target.value)} maxLength={200} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="seat-limit">Seat limit</Label>
              <Input id="seat-limit" type="number" min={1} max={1000} value={seatLimit} onChange={(e) => setSeatLimit(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">3 seats are included with Enterprise. Raise this to sell extra advisor seats; it cannot go below seats already in use.</p>
            </div>
            <div className="space-y-1.5"><Label htmlFor="website">Website</Label><Input id="website" type="url" value={profile.website} onChange={(e) => updateField("website", e.target.value)} maxLength={200} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="address-line1">Address</Label><Input id="address-line1" value={profile.address_line1} onChange={(e) => updateField("address_line1", e.target.value)} maxLength={200} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="address-line2">Address line 2</Label><Input id="address-line2" value={profile.address_line2} onChange={(e) => updateField("address_line2", e.target.value)} maxLength={200} /></div>
            <div className="space-y-1.5"><Label htmlFor="city">City</Label><Input id="city" value={profile.city} onChange={(e) => updateField("city", e.target.value)} maxLength={200} /></div>
            <div className="space-y-1.5"><Label htmlFor="postal-code">Postal code</Label><Input id="postal-code" value={profile.postal_code} onChange={(e) => updateField("postal_code", e.target.value)} maxLength={200} /></div>
            <div className="space-y-1.5"><Label htmlFor="country">Country</Label><Input id="country" value={profile.country} onChange={(e) => updateField("country", e.target.value)} maxLength={200} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="firm-notes">Internal notes</Label><Textarea id="firm-notes" value={profile.notes} onChange={(e) => updateField("notes", e.target.value)} rows={4} maxLength={2000} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button onClick={saveProfile} disabled={saving || !profile.name.trim()}>{saving ? "Saving…" : "Save profile"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
