import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Fingerprint } from "lucide-react";
import { isNativeApp } from "@/lib/native";
import { biometricAvailability, biometricLockEnabled, setBiometricLockEnabled, verifyIdentity } from "@/lib/biometric";
import { toast } from "sonner";

/**
 * Face ID / Touch ID app lock. Only rendered inside the native shell —
 * the browser build has no biometric API to talk to.
 */
export function BiometricLockCard() {
  const [available, setAvailable] = useState<{ available: boolean; label: string }>({ available: false, label: "Biometrics" });
  const [enabled, setEnabled] = useState(biometricLockEnabled());

  useEffect(() => {
    let active = true;
    biometricAvailability().then((a) => { if (active) setAvailable(a); });
    return () => { active = false; };
  }, []);

  if (!isNativeApp() || !available.available) return null;

  const toggle = async (next: boolean) => {
    if (next) {
      const ok = await verifyIdentity(`Enable ${available.label} unlock`);
      if (!ok) { toast.error("Could not verify your identity"); return; }
    }
    setBiometricLockEnabled(next);
    setEnabled(next);
    toast.success(next ? `${available.label} unlock enabled` : `${available.label} unlock disabled`);
  };

  return (
    <Card className="p-6 rounded-2xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Fingerprint className="h-4 w-4" aria-hidden="true" /> {available.label} unlock
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Require {available.label} when opening Vela, and again after the app has been in the
            background for a minute.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={toggle} aria-label={`${available.label} unlock`} />
      </div>
    </Card>
  );
}
