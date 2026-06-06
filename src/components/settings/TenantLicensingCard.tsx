import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Building2, ShieldCheck, Save } from "lucide-react";
import { toast } from "sonner";

/**
 * Tenant-level licensing + branding. The `licensed_professional` flag is the
 * B2B guardrail (P6 §37): only licensed tenants may unlock personalised
 * recommendation features; consumer tenants stay educational.
 */
export function TenantLicensingCard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenantName, setTenantName] = useState("");
  const [primaryHex, setPrimaryHex] = useState("");
  const [licensed, setLicensed] = useState(false);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseAuthority, setLicenseAuthority] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase.from("tenant_settings").select("*").eq("owner_id", user.id).maybeSingle().then(({ data }) => {
      if (data) {
        setTenantName(data.tenant_name ?? "");
        setPrimaryHex(data.brand_primary_hex ?? "");
        setLicensed(!!data.licensed_professional);
        setLicenseNumber(data.license_number ?? "");
        setLicenseAuthority(data.license_authority ?? "");
      }
      setLoading(false);
    });
  }, [user?.id]);

  const save = async () => {
    if (!user) return;
    if (licensed && (!licenseNumber.trim() || !licenseAuthority.trim())) {
      toast.error("License number and authority are required when claiming licensed status");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("tenant_settings").upsert(
      {
        owner_id: user.id,
        tenant_name: tenantName || null,
        brand_primary_hex: primaryHex || null,
        licensed_professional: licensed,
        license_number: licensed ? licenseNumber : null,
        license_authority: licensed ? licenseAuthority : null,
      },
      { onConflict: "owner_id" },
    );
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Tenant settings saved");
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Tenant & licensing</CardTitle>
        <CardDescription>
          Branding and the regulated-professional flag. Recommendation features unlock only for licensed tenants; consumer tenants stay non-personalised and educational.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Tenant name (white-label)</Label>
            <Input value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="Acme Wealth" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Brand primary colour (hex)</Label>
            <Input value={primaryHex} onChange={(e) => setPrimaryHex(e.target.value)} placeholder="#0d47a1" />
          </div>
        </div>
        <div className="rounded-md border border-border p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" /> Licensed professional
              </div>
              <div className="text-xs text-muted-foreground">
                I operate under a regulated investment-advice or brokerage licence and take responsibility for any personalised recommendation surfaced through this workspace.
              </div>
            </div>
            <Switch checked={licensed} onCheckedChange={setLicensed} />
          </div>
          {licensed && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Licence number</Label>
                <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Authority</Label>
                <Input value={licenseAuthority} onChange={(e) => setLicenseAuthority(e.target.value)} placeholder="CONSOB, FCA, …" />
              </div>
            </div>
          )}
          {!licensed && (
            <Badge variant="outline" className="text-[10px]">Consumer mode — educational only, no personalised recommendations</Badge>
          )}
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" /> Save tenant settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}