import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Search } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AuthButton } from "@/components/AuthButton";
import { CommandPalette } from "@/components/CommandPalette";

export default function AppShell() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 sticky top-0 z-30 flex items-center gap-3 px-4 bg-[hsl(var(--sidebar-background))] border-b border-[hsl(var(--sidebar-border))] text-sidebar-foreground">
            <SidebarTrigger className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-white/5" />

            {/* Search */}
            <button
              onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
              className="flex flex-1 max-w-md items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-left text-xs text-sidebar-foreground/50 hover:bg-white/10 hover:text-sidebar-foreground/80 transition-colors"
              aria-label="Search"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="truncate">Search tickers, markets, news…</span>
              <kbd className="ml-auto hidden md:inline-flex items-center text-[10px] bg-white/10 px-1.5 py-0.5 rounded">⌘K</kbd>
            </button>

            <div className="ml-auto flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center rounded-full border border-accent/30 bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent">
                Markets open
              </span>
              <NotificationBell />
              <LanguageSwitcher />
              <AuthButton />
            </div>
          </header>

          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
      <CommandPalette />
    </SidebarProvider>
  );
}