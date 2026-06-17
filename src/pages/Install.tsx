import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Smartphone, Share, Plus, Download, Check, AlertTriangle, MoreVertical } from "lucide-react";
import { SEO } from "@/components/SEO";
import { detectBrowser, isStandaloneDisplay, type BrowserKind } from "@/lib/pwa";
import { PushNotificationsCard } from "@/components/PushNotificationsCard";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Step = { n: number; body: React.ReactNode };

function instructionsFor(browser: BrowserKind): { title: string; steps: Step[]; warning?: string } {
  switch (browser) {
    case "ios-safari":
      return {
        title: "Install on iPhone / iPad (Safari)",
        steps: [
          { n: 1, body: <>Tap the <Share className="inline h-4 w-4 mx-1" /> <strong>Share</strong> button in Safari's bottom toolbar.</> },
          { n: 2, body: <>Scroll the share sheet and tap <Plus className="inline h-4 w-4 mx-1" /> <strong>Add to Home Screen</strong>.</> },
          { n: 3, body: <>Confirm the name and tap <strong>Add</strong> in the top-right corner.</> },
          { n: 4, body: <>Open Vela.ai from your Home Screen - it'll launch full-screen.</> },
        ],
      };
    case "ios-chrome":
      return {
        title: "Install on iPhone (Chrome)",
        steps: [
          { n: 1, body: <>Tap the <Share className="inline h-4 w-4 mx-1" /> <strong>Share</strong> icon in the address bar.</> },
          { n: 2, body: <>Tap <Plus className="inline h-4 w-4 mx-1" /> <strong>Add to Home Screen</strong>.</> },
          { n: 3, body: <>Tap <strong>Add</strong>.</> },
        ],
        warning: "On iOS, Chrome uses Safari's installer under the hood - no Chrome account sync for installed apps.",
      };
    case "ios-firefox":
    case "ios-other":
      return {
        title: "Install on iPhone",
        steps: [
          { n: 1, body: <>Open this page in <strong>Safari</strong> (other iOS browsers can't install web apps).</> },
          { n: 2, body: <>In Safari, tap <Share className="inline h-4 w-4 mx-1" /> <strong>Share</strong> → <Plus className="inline h-4 w-4 mx-1" /> <strong>Add to Home Screen</strong>.</> },
        ],
        warning: "iOS requires Safari to install web apps - Firefox and others won't show the option.",
      };
    case "android-chrome":
      return {
        title: "Install on Android (Chrome)",
        steps: [
          { n: 1, body: <>Tap the <MoreVertical className="inline h-4 w-4 mx-1" /> menu (top-right).</> },
          { n: 2, body: <>Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>).</> },
          { n: 3, body: <>Confirm <strong>Install</strong> in the prompt.</> },
        ],
      };
    case "android-samsung":
      return {
        title: "Install on Android (Samsung Internet)",
        steps: [
          { n: 1, body: <>Tap the menu (☰) at the bottom of the screen.</> },
          { n: 2, body: <>Tap <strong>Add page to</strong> → <strong>Home screen</strong>.</> },
          { n: 3, body: <>Confirm <strong>Add</strong>.</> },
        ],
      };
    case "android-firefox":
      return {
        title: "Install on Android (Firefox)",
        steps: [
          { n: 1, body: <>Tap the <MoreVertical className="inline h-4 w-4 mx-1" /> menu (right of the address bar).</> },
          { n: 2, body: <>Tap <strong>Install</strong> (or <strong>Add to Home screen</strong>).</> },
          { n: 3, body: <>Confirm to add Vela.ai to your launcher.</> },
        ],
      };
    case "android-other":
      return {
        title: "Install on Android",
        steps: [
          { n: 1, body: <>Open your browser's menu.</> },
          { n: 2, body: <>Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>.</> },
        ],
        warning: "For the best experience, use Chrome, Samsung Internet, or Firefox.",
      };
    case "desktop-chrome":
    case "desktop-edge":
      return {
        title: browser === "desktop-edge" ? "Install on desktop (Edge)" : "Install on desktop (Chrome)",
        steps: [
          { n: 1, body: <>Click the <Download className="inline h-4 w-4 mx-1" /> <strong>install</strong> icon at the right edge of the address bar.</> },
          { n: 2, body: <>Click <strong>Install</strong> in the popup.</> },
          { n: 3, body: <>Vela.ai opens in its own window - pin it to your taskbar / dock.</> },
        ],
      };
    case "desktop-safari":
      return {
        title: "Install on Mac (Safari)",
        steps: [
          { n: 1, body: <>From the menu bar, choose <strong>File → Add to Dock…</strong></> },
          { n: 2, body: <>Confirm <strong>Add</strong>.</> },
          { n: 3, body: <>Launch Vela.ai from your Dock or Launchpad.</> },
        ],
        warning: "Requires macOS Sonoma (14) or later.",
      };
    case "desktop-firefox":
      return {
        title: "Install on desktop (Firefox)",
        steps: [{ n: 1, body: <>Firefox desktop doesn't support installing web apps yet. Use Chrome or Edge for an installable window, or just bookmark this page.</> }],
        warning: "Firefox desktop has no PWA install option as of 2026.",
      };
    default:
      return {
        title: "Install Vela.ai",
        steps: [{ n: 1, body: <>Open your browser's menu and look for <strong>Install</strong> or <strong>Add to Home Screen</strong>.</> }],
      };
  }
}

export default function Install() {
  const [browser] = useState<BrowserKind>(detectBrowser);
  const [installed, setInstalled] = useState(isStandaloneDisplay);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent); };
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

  const guide = instructionsFor(browser);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <SEO title="Install Vela.ai" description="Install Vela.ai as an app on your phone or desktop." path="/install" />
      <div className="max-w-lg w-full space-y-4">
        <Card className="p-8 rounded-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-11 w-11 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Install Vela.ai</h1>
              <p className="text-sm text-muted-foreground">Add Vela to your home screen - opens like a real app, works offline.</p>
            </div>
          </div>

          {installed ? (
            <div className="flex items-center gap-2 rounded-lg bg-success/10 text-success border border-success/30 px-4 py-3 text-sm">
              <Check className="h-4 w-4" /> Vela.ai is installed. Open it from your home screen.
            </div>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3">{guide.title}</h2>

              {deferred && (
                <Button onClick={handleInstall} className="w-full gap-2 mb-4">
                  <Download className="h-4 w-4" /> Install Vela.ai
                </Button>
              )}

              <ol className="space-y-3 text-sm text-foreground">
                {guide.steps.map((s) => (
                  <li key={s.n} className="flex gap-3">
                    <span className="font-semibold text-accent">{s.n}.</span>
                    <span>{s.body}</span>
                  </li>
                ))}
              </ol>

              {guide.warning && (
                <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-3 py-2 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{guide.warning}</span>
                </div>
              )}
            </>
          )}

          <p className="mt-6 text-xs text-muted-foreground">
            Once installed, Vela opens full-screen, loads instantly, and stays usable on flaky connections.
          </p>
        </Card>

        <PushNotificationsCard />
      </div>
    </div>
  );
}