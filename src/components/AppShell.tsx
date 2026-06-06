import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
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
  return (
    <MaintenanceGate>
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <PlatformBannerBar />
          <ClientContextBanner />
          <header className="h-16 sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6 bg-background border-b border-border">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground hover:bg-muted/60" />

            {/* Search */}
            <button
              onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
              className="flex flex-1 max-w-2xl items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-left text-sm text-muted-foreground hover:border-primary/40 transition-colors"
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
              <AuthButton />
            </div>
          </header>

          <main className="flex-1 min-w-0">
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
    </SidebarProvider>
    </MaintenanceGate>
  );
}