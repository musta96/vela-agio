import { useCallback, useEffect, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { Fingerprint, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { isNativeApp } from "@/lib/native";
import { biometricAvailability, biometricLockEnabled, verifyIdentity } from "@/lib/biometric";

/** Re-lock after this long in the background. */
const BACKGROUND_GRACE_MS = 60_000;

/**
 * Face ID / Touch ID gate for the native shells.
 *
 * Renders an opaque cover over the whole app whenever the device owner still
 * has to be verified, so portfolio values never flash on screen (they'd also
 * be captured in the iOS app switcher snapshot otherwise).
 */
export function BiometricLock() {
  const { user } = useAuth();
  const [locked, setLocked] = useState(false);
  const [label, setLabel] = useState("Face ID");
  const [busy, setBusy] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const enabled = isNativeApp() && biometricLockEnabled();

  const unlock = useCallback(async () => {
    setBusy(true);
    const ok = await verifyIdentity("Unlock Vela.ai");
    setBusy(false);
    if (ok) setLocked(false);
  }, []);

  // Cold start: lock immediately, then prompt.
  useEffect(() => {
    if (!enabled || !user) {
      setLocked(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { available, label: l } = await biometricAvailability();
      if (cancelled || !available) return;
      setLabel(l);
      setLocked(true);
      void unlock();
    })();
    return () => { cancelled = true; };
  }, [enabled, user, unlock]);

  // Re-lock when the app comes back from the background.
  useEffect(() => {
    if (!enabled || !user) return;
    let remove: (() => void) | undefined;
    (async () => {
      const handle = await CapApp.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) {
          backgroundedAt.current = Date.now();
          return;
        }
        const away = backgroundedAt.current ? Date.now() - backgroundedAt.current : 0;
        backgroundedAt.current = null;
        if (away > BACKGROUND_GRACE_MS) {
          setLocked(true);
          void unlock();
        }
      });
      remove = () => void handle.remove();
    })();
    return () => remove?.();
  }, [enabled, user, unlock]);

  if (!locked) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Lock className="h-7 w-7 text-primary" />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Vela.ai is locked</h1>
        <p className="text-sm text-muted-foreground">Unlock with {label} to see your portfolio.</p>
      </div>
      <Button onClick={() => void unlock()} disabled={busy} className="gap-2">
        <Fingerprint className="h-4 w-4" />
        {busy ? "Waiting…" : `Unlock with ${label}`}
      </Button>
    </div>
  );
}

export default BiometricLock;
