import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Smartphone, Share, Plus, Download, Check } from "lucide-react";
import { SEO } from "@/components/SEO";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function detectPlatform(): "ios" | "android" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as any).standalone === true
  );
}

export default function Install() {
  const [platform] = useState(detectPlatform);
  const [installed, setInstalled] = useState(isStandalone);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferred(null);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <SEO title="Install Vela.ai" description="Install Vela.ai as an app on your phone or desktop." />
      <Card className="max-w-lg w-full p-8 rounded-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-11 w-11 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Install Vela.ai</h1>
            <p className="text-sm text-muted-foreground">Add Vela to your home screen — works offline, opens like a real app.</p>
          </div>
        </div>

        {installed ? (
          <div className="flex items-center gap-2 rounded-lg bg-success/10 text-success border border-success/30 px-4 py-3 text-sm">
            <Check className="h-4 w-4" /> Vela.ai is installed. Open it from your home screen.
          </div>
        ) : platform === "ios" ? (
          <ol className="space-y-3 text-sm text-foreground">
            <li className="flex gap-3"><span className="font-semibold text-accent">1.</span> Tap the <Share className="inline h-4 w-4 mx-1" /> <strong>Share</strong> button in Safari.</li>
            <li className="flex gap-3"><span className="font-semibold text-accent">2.</span> Scroll and tap <Plus className="inline h-4 w-4 mx-1" /> <strong>Add to Home Screen</strong>.</li>
            <li className="flex gap-3"><span className="font-semibold text-accent">3.</span> Tap <strong>Add</strong> in the top-right.</li>
          </ol>
        ) : platform === "android" ? (
          <>
            {deferred ? (
              <Button onClick={handleInstall} className="w-full gap-2"><Download className="h-4 w-4" /> Install Vela.ai</Button>
            ) : (
              <ol className="space-y-3 text-sm text-foreground">
                <li className="flex gap-3"><span className="font-semibold text-accent">1.</span> Open Chrome menu (⋮).</li>
                <li className="flex gap-3"><span className="font-semibold text-accent">2.</span> Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                <li className="flex gap-3"><span className="font-semibold text-accent">3.</span> Confirm <strong>Install</strong>.</li>
              </ol>
            )}
          </>
        ) : (
          <>
            {deferred ? (
              <Button onClick={handleInstall} className="w-full gap-2"><Download className="h-4 w-4" /> Install Vela.ai</Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                In Chrome / Edge, click the <strong>install</strong> icon in the address bar, or open the browser menu → <strong>Install Vela.ai</strong>.
                In Safari (macOS), use <strong>File → Add to Dock</strong>.
              </p>
            )}
          </>
        )}

        <p className="mt-6 text-xs text-muted-foreground">
          Once installed, Vela opens full-screen, loads instantly, and works even on flaky connections.
        </p>
      </Card>
    </div>
  );
}