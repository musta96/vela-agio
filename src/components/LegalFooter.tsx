import { Link } from "react-router-dom";
import { openCookieSettings } from "@/lib/consent";
import { ShieldAlert } from "lucide-react";

export function LegalFooter() {
  return (
    <footer className="border-t border-border bg-card/30 mt-12">
      <div className="px-6 py-6 space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
          <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <span className="text-amber-500 font-medium">Not investment advice.</span>{" "}
            Vela.ai is an information tool, not a regulated financial advisor or broker. All
            content is informational only. Past performance does not guarantee future results.
            Consult a licensed advisor before making investment decisions.{" "}
            <Link to="/disclaimer" className="text-primary hover:underline">
              Read full disclaimer
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 text-[11px] text-muted-foreground">
          <div>© {new Date().getFullYear()} Vela.ai - Made in Italy</div>
          <nav className="flex flex-wrap gap-x-4 gap-y-1">
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
            <Link to="/disclaimer" className="hover:text-foreground">Disclaimer</Link>
            <Link to="/cookies" className="hover:text-foreground">Cookies</Link>
            <button onClick={openCookieSettings} className="hover:text-foreground">
              Cookie settings
            </button>
          </nav>
        </div>
      </div>
    </footer>
  );
}