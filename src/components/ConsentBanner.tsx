import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  acceptAll,
  rejectAll,
  setConsent,
  getConsent,
  CONSENT_EVENTS,
} from "@/lib/consent";
import { Cookie, Shield, BarChart3, Megaphone } from "lucide-react";

export function ConsentBanner() {
  const [needsDecision, setNeedsDecision] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const c = getConsent();
    if (!c) setNeedsDecision(true);
    else {
      setAnalytics(c.analytics);
      setMarketing(c.marketing);
    }
    const openHandler = () => {
      const cur = getConsent();
      if (cur) {
        setAnalytics(cur.analytics);
        setMarketing(cur.marketing);
      }
      setSettingsOpen(true);
    };
    window.addEventListener(CONSENT_EVENTS.OPEN_EVENT, openHandler);
    return () => window.removeEventListener(CONSENT_EVENTS.OPEN_EVENT, openHandler);
  }, []);

  const handleAcceptAll = () => {
    acceptAll();
    setNeedsDecision(false);
    setSettingsOpen(false);
  };

  const handleRejectAll = () => {
    rejectAll();
    setNeedsDecision(false);
    setSettingsOpen(false);
  };

  const handleSavePrefs = () => {
    setConsent({ analytics, marketing });
    setNeedsDecision(false);
    setSettingsOpen(false);
  };

  return (
    <>
      {needsDecision && (
        <div
          role="dialog"
          aria-label="Cookie consent"
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-[100]
            rounded-xl border border-border bg-card shadow-2xl p-4 animate-in slide-in-from-bottom-4"
        >
          <div className="flex items-start gap-3 mb-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <Cookie className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground mb-1">
                Cookies &amp; your privacy
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                We use essential cookies to make Vela.ai work. With your consent we also use
                analytics cookies to improve the product. You can change your choice anytime in{" "}
                <Link to="/cookies" className="text-primary hover:underline">
                  cookie settings
                </Link>
                . See our{" "}
                <Link to="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
              Customize
            </Button>
            <Button variant="outline" size="sm" onClick={handleRejectAll}>
              Reject all
            </Button>
            <Button size="sm" onClick={handleAcceptAll}>
              Accept all
            </Button>
          </div>
        </div>
      )}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cookie preferences</DialogTitle>
            <DialogDescription>
              Choose which categories of cookies Vela.ai may use. Strictly necessary cookies are
              always on because the service cannot run without them.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <CategoryRow
              icon={<Shield className="h-4 w-4" />}
              title="Strictly necessary"
              description="Authentication, session, security. Required."
              checked={true}
              disabled
              onChange={() => {}}
            />
            <CategoryRow
              icon={<BarChart3 className="h-4 w-4" />}
              title="Analytics"
              description="Anonymous usage stats to help us improve Vela.ai."
              checked={analytics}
              onChange={setAnalytics}
            />
            <CategoryRow
              icon={<Megaphone className="h-4 w-4" />}
              title="Marketing"
              description="Reserved for future use. No third-party ad pixels run today."
              checked={marketing}
              onChange={setMarketing}
            />
          </div>

          <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={handleRejectAll}>
              Reject all
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleSavePrefs}>
                Save preferences
              </Button>
              <Button size="sm" onClick={handleAcceptAll}>
                Accept all
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CategoryRow({
  icon,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border bg-background/50">
      <div className="flex items-start gap-3 min-w-0">
        <div className="p-1.5 rounded bg-muted text-muted-foreground shrink-0">{icon}</div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
        </div>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}