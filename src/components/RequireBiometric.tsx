import { useCallback, useEffect, useState } from "react";
import { Fingerprint, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isNativeApp } from "@/lib/native";
import { biometricAvailability, verifyIdentity } from "@/lib/biometric";

/**
 * Per-page Face ID / Touch ID gate for money screens on the native build.
 *
 * Independent of the global app lock: even when the app-wide lock is off,
 * balance pages ask for the device owner before showing any figures. On the
 * web build (and on devices without biometrics) it renders children directly.
 */
export function RequireBiometric({
  children,
  reason = "Unlock your portfolio",
}: {
  children: React.ReactNode;
  reason?: string;
}) {
  const [status, setStatus] = useState<"checking" | "locked" | "open">(
    isNativeApp() ? "checking" : "open",
  );
  const [label, setLabel] = useState("Face ID");
  const [busy, setBusy] = useState(false);

  const unlock = useCallback(async () => {
    setBusy(true);
    const ok = await verifyIdentity(reason);
    setBusy(false);
    setStatus(ok ? "open" : "locked");
  }, [reason]);

  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    (async () => {
      const { available, label: l } = await biometricAvailability();
      if (cancelled) return;
      if (!available) {
        setStatus("open");
        return;
      }
      setLabel(l);
      setStatus("locked");
      void unlock();
    })();
    return () => {
      cancelled = true;
    };
  }, [unlock]);

  if (status === "open") return <>{children}</>;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <ShieldCheck className="h-7 w-7 text-primary" />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Protected page</h1>
        <p className="text-sm text-muted-foreground">
          {status === "checking" ? "Checking your device…" : `Confirm with ${label} to see your balances.`}
        </p>
      </div>
      {status === "locked" && (
        <Button onClick={() => void unlock()} disabled={busy} className="gap-2">
          <Fingerprint className="h-4 w-4" />
          {busy ? "Waiting…" : `Unlock with ${label}`}
        </Button>
      )}
    </div>
  );
}

export default RequireBiometric;
