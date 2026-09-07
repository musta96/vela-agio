import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { COUNTRY_OPTIONS, SECTOR_OPTIONS, STAGE_OPTIONS, type CompanyDraft, type CompanyKind, type PrivateCompany } from "@/hooks/usePrivateCompanies";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: CompanyKind;
  /** When set, the dialog edits this company instead of creating a new one. */
  editing?: PrivateCompany | null;
  onSubmit: (draft: CompanyDraft) => Promise<unknown> | void;
}

const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

/** Add or edit a company you hold or follow privately. */
export function CompanyFormDialog({ open, onOpenChange, kind, editing, onSubmit }: Props) {
  const blank = {
    name: "", website: "", country: "IT", sector: "software", stage: "seed", currency: "EUR",
    round_name: "", round_date: "", round_size: "", pre_money: "", post_money: "",
    amount_invested: "", ownership_pct: "", current_valuation: "", status: kind === "startup" ? "watching" : "held",
    description: "", notes: "",
  };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!editing) { setF(blank); return; }
    setF({
      name: editing.name, website: editing.website ?? "", country: editing.country, sector: editing.sector,
      stage: editing.stage, currency: editing.currency, round_name: editing.round_name ?? "",
      round_date: editing.round_date ?? "", round_size: editing.round_size?.toString() ?? "",
      pre_money: editing.pre_money?.toString() ?? "", post_money: editing.post_money?.toString() ?? "",
      amount_invested: editing.amount_invested?.toString() ?? "", ownership_pct: editing.ownership_pct?.toString() ?? "",
      current_valuation: editing.current_valuation?.toString() ?? "", status: editing.status,
      description: editing.description ?? "", notes: editing.notes ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const text = (label: string, k: keyof typeof f, placeholder = "", type = "text") => (
    <div className="space-y-1">
      <Label className="text-xs" htmlFor={`cf-${k}`}>{label}</Label>
      <Input id={`cf-${k}`} type={type} value={f[k]} placeholder={placeholder} onChange={set(k)} />
    </div>
  );

  const select = (label: string, k: keyof typeof f, options: Array<{ id: string; label: string }>) => (
    <div className="space-y-1">
      <Label className="text-xs" htmlFor={`cf-${k}`}>{label}</Label>
      <select id={`cf-${k}`} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={f[k]} onChange={set(k)}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );

  async function submit() {
    if (!f.name.trim()) return;
    setBusy(true);
    try {
      await onSubmit({
        name: f.name.trim(), website: f.website.trim() || null, country: f.country, sector: f.sector,
        stage: f.stage, currency: f.currency.toUpperCase(), round_name: f.round_name || null,
        round_date: f.round_date || null, round_size: numOrNull(f.round_size), pre_money: numOrNull(f.pre_money),
        post_money: numOrNull(f.post_money), amount_invested: numOrNull(f.amount_invested),
        ownership_pct: numOrNull(f.ownership_pct), current_valuation: numOrNull(f.current_valuation),
        status: f.status, description: f.description || null, notes: f.notes || null,
      });
      onOpenChange(false);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit company" : kind === "startup" ? "Add startup" : "Add private holding"}</DialogTitle>
          <DialogDescription>
            {kind === "startup"
              ? "Track the stage, the round on the table and what it is valued at. The website lets the AI read the company's own pages."
              : "Track what you put in, what you own and what it is worth today."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {text("Company name", "name")}
          {text("Website", "website", "www.company.com")}
          {select("Stage", "stage", STAGE_OPTIONS)}
          {select("Sector", "sector", SECTOR_OPTIONS.map((s) => ({ id: s, label: s })))}
          {select("Country", "country", COUNTRY_OPTIONS.map((c) => ({ id: c, label: c })))}
          {text("Currency", "currency")}
          {text("Round name", "round_name", "Seed extension")}
          {text("Round date", "round_date", "", "date")}
          {text("Round size", "round_size", "1500000", "number")}
          {text("Pre-money", "pre_money", "", "number")}
          {text("Post-money", "post_money", "", "number")}
          {text("Current valuation", "current_valuation", "", "number")}
          {text("Amount invested", "amount_invested", "", "number")}
          {text("Ownership %", "ownership_pct", "5", "number")}
          {select("Status", "status", [
            { id: "watching", label: "Watching" },
            { id: "diligence", label: "In diligence" },
            { id: "committed", label: "Committed" },
            { id: "held", label: "Held" },
            { id: "exited", label: "Exited" },
            { id: "written_off", label: "Written off" },
          ])}
          <div className="sm:col-span-2 space-y-1">
            <Label className="text-xs" htmlFor="cf-description">What the company does</Label>
            <Textarea id="cf-description" rows={2} value={f.description} onChange={set("description")} />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label className="text-xs" htmlFor="cf-notes">Your notes</Label>
            <Textarea id="cf-notes" rows={2} value={f.notes} onChange={set("notes")} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !f.name.trim()}>{editing ? "Save changes" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
