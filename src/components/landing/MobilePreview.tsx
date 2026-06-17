import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Smartphone, X } from "lucide-react";

const SIZES = [360, 390, 430] as const;

/**
 * Floating mobile-preview switcher. Activates when the URL contains
 * `?preview=mobile`. Renders the landing page inside an iframe at the
 * selected device width so you can QA layout shifts without resizing
 * the browser window.
 */
export default function MobilePreview() {
  const [width, setWidth] = useState<(typeof SIZES)[number]>(390);
  const [open, setOpen] = useState(true);

  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") !== "mobile") return null;

  if (!open) {
    return (
      <Button
        size="icon"
        className="fixed bottom-4 right-4 z-[100] h-12 w-12 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
        aria-label="Open mobile preview"
      >
        <Smartphone className="h-5 w-5" />
      </Button>
    );
  }

  const iframeSrc = `${window.location.pathname}?preview=off`;

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center gap-4 p-4">
      <div className="flex items-center gap-2">
        {SIZES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={width === s ? "default" : "outline"}
            onClick={() => setWidth(s)}
            className="min-h-11 min-w-16"
          >
            {s}px
          </Button>
        ))}
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setOpen(false)}
          aria-label="Close mobile preview"
          className="min-h-11 min-w-11"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div
        className="rounded-[2rem] border-4 border-border shadow-2xl overflow-hidden bg-background transition-all"
        style={{ width, height: Math.min(window.innerHeight - 140, 844) }}
      >
        <iframe
          title="Mobile preview"
          src={iframeSrc}
          className="w-full h-full"
          style={{ border: 0 }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Mobile QA mode - viewport: {width}×{Math.min(window.innerHeight - 140, 844)}px
      </p>
    </div>
  );
}