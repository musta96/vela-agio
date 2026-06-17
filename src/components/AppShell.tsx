import { Outlet, useLocation } from "react-router-dom";
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
function useHideOnScroll(threshold = 8) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY.current;
      if (Math.abs(dy) < threshold) return;
      if (y < 80) setHidden(false);
      else if (dy > 0) setHidden(true);
      else setHidden(false);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
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
            className={`h-16 sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6 glass-panel border-b border-border/60 transition-transform duration-200 will-change-transform ${headerHidden ? "-translate-y-full md:translate-y-0" : "translate-y-0"}`}
          >
            {/* Sidebar trigger: desktop/tablet only. On mobile the "More" bottom tab opens the menu. */}
            <SidebarTrigger className="hidden md:inline-flex text-muted-foreground hover:text-foreground hover:bg-muted/60" />

            {/* Search */}
            <button
              onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
              className="flex flex-1 max-w-2xl items-center gap-2 rounded-xl glass-card px-4 py-2.5 text-left text-sm text-muted-foreground hover:border-primary/40 transition-colors"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
              <span className="truncate">Search tickers, markets, news, screeners…</span>
              <kbd className="ml-auto hidden md:inline-flex items-center text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">⌘K</kbd>
            </button>

            <div className="ml-auto flex items-center gap-2">
              <MarketStatusPill />
              <NotificationBell />
              <LanguageSwitcher />
              <ThemeToggle />
              <AuthButton />
            </div>
          </header>

          <main className="flex-1 min-w-0 pb-16 md:pb-0 overflow-x-hidden">
            <ErrorBoundary label="route">
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