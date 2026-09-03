import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { openCookieSettings } from "@/lib/consent";
import { ShieldAlert } from "lucide-react";

export function LegalFooter() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-border bg-card/30 mt-12">
      <div className="px-6 py-6 space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
          <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <span className="text-amber-500 font-medium">{t("footer.noticeLabel")}</span>{" "}
            {t("footer.notice")}{" "}
            <Link to="/disclaimer" className="text-primary hover:underline">
              {t("footer.readDisclaimer")}
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 text-[11px] text-muted-foreground">
          <div>{t("footer.copyright", { year: new Date().getFullYear() })}</div>
          <nav className="flex flex-wrap gap-x-4 gap-y-1">
            <Link to="/privacy" className="hover:text-foreground">{t("footer.privacy")}</Link>
            <Link to="/terms" className="hover:text-foreground">{t("footer.terms")}</Link>
            <Link to="/disclaimer" className="hover:text-foreground">{t("footer.disclaimer")}</Link>
            <Link to="/cookies" className="hover:text-foreground">{t("footer.cookies")}</Link>
            <button onClick={openCookieSettings} className="hover:text-foreground">
              {t("footer.cookieSettings")}
            </button>
          </nav>
        </div>
      </div>
    </footer>
  );
}
