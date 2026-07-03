import { Outlet, useLocation } from "react-router-dom";
import { TrialStatusBanner } from "@/components/trial/TrialStatusBanner";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Search } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AuthButton } from "@/components/AuthButton";
import { CommandPalette } from "@/components/CommandPalette";
import { LegalFooter } from "@/components/LegalFooter";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CopilotFab } from "@/components/CopilotFab";
import { LiveOrderConfirmModal } from "@/components/LiveOrderConfirmModal";
import { PlatformBannerBar } from "@/components/PlatformBannerBar";
import { MaintenanceGate } from "@/components/MaintenanceGate";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { ClientContextBanner } from "@/components/ClientContextBanner";
import { useMarketClock } from "@/hooks/useMarketClock";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { useEffect, useRef, useState } from "react";

/** Auto-close the mobile sidebar sheet whenever the route changes. */
function CloseMobileSidebarOnNav() {
  const { setOpenMobile, isMobile } = useSidebar();
  const { pathname } = useLocation();
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [pathname, isMobile, setOpenMobile]);
  return null;
}

/**
 * Auto-hide the top header on scroll-down, reveal on scroll-up (mobile only).
 * Keeps quick access to search/menu just one small flick away.
 */
/**
 * Hide-on-scroll-down / reveal-on-scroll-up for the mobile header.
 * Accumulates small upward gestures so even a tiny flick (~6px) reveals the
 * search bar, while requiring a more deliberate downward scroll to hide it.
 */
function useHideOnScroll() {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const lastTouchY = useRef<number | null>(null);
  const downAccum = useRef(0);
  useEffect(() => {
    const getY = () =>
      window.scrollY ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0;
    lastY.current = getY();
    const onScroll = () => {
      const y = getY();
      const dy = y - lastY.current;
      lastY.current = y;
      if (y < 56) {
        setHidden(false);
        downAccum.current = 0;
        return;
      }
      if (dy < 0) {
        downAccum.current = 0;
        setHidden(false);
      } else if (dy > 0) {
        downAccum.current += dy;
        if (downAccum.current > 16) setHidden(true);
      }
    };
    const reveal = () => {
      downAccum.current = 0;
      setHidden(false);
    };
    const onTouchStart = (event: TouchEvent) => {
      lastY.current = getY();
      lastTouchY.current = event.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (event: TouchEvent) => {
      const touchY = event.touches[0]?.clientY;
      if (touchY == null || lastTouchY.current == null) return;
      const fingerDelta = touchY - lastTouchY.current;
      lastTouchY.current = touchY;

      // iOS can delay/coalesce scroll events during a flick. Reveal directly
      // from the touch gesture whenever the user starts scrolling back up.
      if (fingerDelta > 1) reveal();
    };
    const onTouchEnd = () => { lastTouchY.current = null; };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);
  return hidden;
}

function MarketStatusPill() {
  const { status, short, market, label } = useMarketClock();
  const tone =
    status === "open"
      ? "bg-success/10 text-success [&_.dot]:bg-success"
      : status === "pre" || status === "post"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 [&_.dot]:bg-amber-500"
      : "bg-muted text-muted-foreground [&_.dot]:bg-muted-foreground/60";
  return (
    <span
      className={`hidden sm:inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium ${tone}`}
      title={label}
      data-no-translate
    >
      <span className="dot h-1.5 w-1.5 rounded-full" /> {short} · {market.label}
    </span>
  );
}

export default function AppShell() {
  const headerHidden = useHideOnScroll();
  const location = useLocation();
  return (
    <MaintenanceGate>
    <SidebarProvider>
      <CloseMobileSidebarOnNav />
      <div className="min-h-screen flex w-full bg-background gradient-hero overflow-x-hidden">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
          <PlatformBannerBar />
          <ClientContextBanner />
          <header
            className={`h-16 sticky top-0 z-30 flex items-center gap-2 sm:gap-3 px-3 sm:px-6 glass-panel border-b border-border/60 transition-transform duration-200 will-change-transform ${headerHidden ? "-translate-y-full md:translate-y-0" : "translate-y-0"}`}
            style={{
              paddingLeft: "max(env(safe-area-inset-left), 12px)",
              paddingRight: "max(env(safe-area-inset-right), 12px)",
            }}
          >
            {/* Sidebar trigger: desktop/tablet only. On mobile the "More" bottom tab opens the menu. */}
            <SidebarTrigger className="hidden md:inline-flex text-muted-foreground hover:text-foreground hover:bg-muted/60" />

            {/* Search */}
            <button
              onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
              className="flex flex-1 min-w-0 max-w-2xl items-center gap-2 rounded-xl glass-card px-3 sm:px-4 py-2.5 text-left text-sm text-muted-foreground hover:border-primary/40 transition-colors"
              aria-label="Search"
              data-tour="app-search"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="truncate"><span className="hidden sm:inline">Search tickers, markets, news, screeners…</span><span className="sm:hidden">Search…</span></span>
              <kbd className="ml-auto hidden md:inline-flex items-center text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">⌘K</kbd>
            </button>

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <MarketStatusPill />
              <NotificationBell />
              {/* Secondary controls — hidden on phones; available from the "More" sheet via bottom nav. */}
              <div className="hidden md:flex items-center gap-2">
                <LanguageSwitcher />
                <ThemeToggle />
              </div>
              <AuthButton />
            </div>
          </header>

          <main
            className="flex-1 min-w-0 overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+96px)] md:pb-0"
          >
            <TrialStatusBanner />
            <ErrorBoundary label="route" resetKey={location.pathname + location.search}>
              <Outlet />
            </ErrorBoundary>
            <LegalFooter />
          </main>
        </div>
      </div>
      <CommandPalette />
      <CopilotFab />
      <LiveOrderConfirmModal />
      <UpdatePrompt />
      <MobileBottomNav />
    </SidebarProvider>
    </MaintenanceGate>
  );
}