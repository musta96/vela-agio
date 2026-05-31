import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";

/**
 * Listens for a waiting service worker and shows an in-app banner so the user
 * can refresh to the new version on demand. Skipped inside Lovable preview
 * iframes (the registration guard in main.tsx prevents SW registration there).
 */
export function UpdatePrompt() {
  const [dismissed, setDismissed] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Check for a new build every 30 minutes while the tab is open.
      if (!reg) return;
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    },
  });

  useEffect(() => {
    if (needRefresh) setDismissed(false);
  }, [needRefresh]);

  if (!needRefresh || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 w-[calc(100%-2rem)] max-w-md">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card/95 backdrop-blur px-4 py-3 shadow-lg">
        <RefreshCw className="h-4 w-4 text-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">A new version of Vela.ai is ready</p>
          <p className="text-xs text-muted-foreground">Refresh to get the latest features and fixes.</p>
        </div>
        <Button size="sm" onClick={() => updateServiceWorker(true)} className="h-8">
          Refresh
        </Button>
        <button
          aria-label="Dismiss"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => {
            setDismissed(true);
            setNeedRefresh(false);
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}