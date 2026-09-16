import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "vela-privacy-mode";

interface PrivacyModeContextValue {
  /** true = monetary amounts are masked on screen */
  hidden: boolean;
  toggle: () => void;
  /** Replace a formatted money string with bullets when hidden. */
  mask: (formatted: string) => string;
}

const PrivacyModeContext = createContext<PrivacyModeContextValue>({
  hidden: false,
  toggle: () => {},
  mask: (s) => s,
});

export function PrivacyModeProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, hidden ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, [hidden]);

  const toggle = useCallback(() => setHidden((h) => !h), []);
  const mask = useCallback(
    (formatted: string) => (hidden ? formatted.replace(/[0-9]/g, "•") : formatted),
    [hidden],
  );

  const value = useMemo(() => ({ hidden, toggle, mask }), [hidden, toggle, mask]);

  return <PrivacyModeContext.Provider value={value}>{children}</PrivacyModeContext.Provider>;
}

export function usePrivacyMode() {
  return useContext(PrivacyModeContext);
}
