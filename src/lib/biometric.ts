import { NativeBiometric, BiometryType } from "capacitor-native-biometric";
import { isNativeApp } from "@/lib/native";

/**
 * Face ID / Touch ID app lock.
 *
 * This is a *local* re-authentication gate over an already-authenticated
 * Supabase session: it never replaces the sign-in, it just keeps portfolio
 * data hidden until the device owner is verified after a cold start or after
 * the app has been in the background.
 */

const PREF_KEY = "vela.biometric.enabled";

export interface BiometricAvailability {
  available: boolean;
  label: string;
}

export async function biometricAvailability(): Promise<BiometricAvailability> {
  if (!isNativeApp()) return { available: false, label: "Biometric unlock" };
  try {
    const res = await NativeBiometric.isAvailable({ useFallback: true });
    const label =
      res.biometryType === BiometryType.FACE_ID
        ? "Face ID"
        : res.biometryType === BiometryType.TOUCH_ID
          ? "Touch ID"
          : res.biometryType === BiometryType.FINGERPRINT
            ? "Fingerprint"
            : "Biometric unlock";
    return { available: !!res.isAvailable, label };
  } catch {
    return { available: false, label: "Biometric unlock" };
  }
}

export function biometricLockEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PREF_KEY) === "1";
}

export function setBiometricLockEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PREF_KEY, enabled ? "1" : "0");
}

/** Resolves true when the device owner was verified (or verification isn't possible). */
export async function verifyIdentity(reason = "Unlock Vela.ai"): Promise<boolean> {
  if (!isNativeApp()) return true;
  try {
    await NativeBiometric.verifyIdentity({
      reason,
      title: "Vela.ai",
      subtitle: "Confirm it's you",
      useFallback: true,
    });
    return true;
  } catch {
    return false;
  }
}
