import {
  Activity, Command as CommandIcon, ChevronDown, Menu,
  Home, Bot, Sparkles, Briefcase, Globe2, Search,
  GitCompare, Grid3x3, Heart, LineChart, Filter, Layers,
  FileText, CalendarDays, UserSearch, FlaskConical, Clock,
  GitBranch, Users, Sigma, NotebookPen, Eye, ShieldAlert,
  Repeat, Wallet, Target, Bell, Scale, RefreshCw, ClipboardList,
  ShieldCheck, GraduationCap, BookOpen, Code2, Tag, Settings as SettingsIcon,
  ScrollText,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { AuthButton } from "@/components/AuthButton";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CommandPalette } from "@/components/CommandPalette";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type Item = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };
type Group = { label: string; icon: React.ComponentType<{ className?: string }>; items: Item[] };

export const TopNav = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) { setIsAdmin(false); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin")
      .maybeSingle().then(({ data }) => { if (!cancelled) setIsAdmin(!!data); });
    return () => { cancelled = true; };
  }, [user]);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const PRIMARY: Item[] = [
    { to: "/", label: t("nav.dashboard"), icon: Home },
    { to: "/copilot", label: t("nav.copilot"), icon: Bot },
    { to: "/picks", label: t("nav.aiPicks"), icon: Sparkles },
    { to: "/portfolio", label: t("nav.portfolio"), icon: Briefcase },
    { to: "/macro", label: t("nav.macro"), icon: Globe2 },
  ];

  const GROUPS: Group[] = [
    { label: t("nav.research"), icon: Search, items: [
      { to: "/compare", label: t("nav.compare"), icon: GitCompare },
      { to: "/sectors", label: t("nav.sectors"), icon: Grid3x3 },
      { to: "/sentiment", label: t("nav.sentiment"), icon: Heart },
      { to: "/technical", label: t("nav.technicals"), icon: LineChart },
      { to: "/screener", label: t("nav.screener"), icon: Filter },
      { to: "/baskets", label: t("nav.baskets"), icon: Layers },
      { to: "/filings", label: t("nav.filings"), icon: FileText },
      { to: "/earnings", label: t("nav.earnings"), icon: CalendarDays },
      { to: "/insider", label: t("nav.insider"), icon: UserSearch },
      { to: "/event-study", label: t("nav.eventStudy"), icon: FlaskConical },
      { to: "/intraday", label: "Intraday & L2", icon: Clock },
      { to: "/corporate-actions", label: "Corporate Actions", icon: GitBranch },
      { to: "/peers", label: "Peer Analysis", icon: Users },
      { to: "/quant", label: "Quant Alpha", icon: Sigma },
      { to: "/notes", label: "Research Notes", icon: NotebookPen },
    ]},
    { label: t("nav.portfolio"), icon: Briefcase, items: [
      { to: "/watchlist", label: t("nav.watchlist"), icon: Eye },
      { to: "/risk", label: t("nav.riskEngine"), icon: ShieldAlert },
      { to: "/backtest", label: t("nav.backtest"), icon: Repeat },
      { to: "/tax-harvest", label: t("nav.taxHarvesting"), icon: Wallet },
      { to: "/goals", label: t("nav.goalsPlanner"), icon: Target },
      { to: "/alerts", label: t("nav.alerts"), icon: Bell },
      { to: "/optimizer", label: "Optimizer", icon: Scale },
      { to: "/rebalance", label: "Rebalance", icon: RefreshCw },
      { to: "/blotter", label: "Paper Blotter", icon: ClipboardList },
      { to: "/suitability", label: "Suitability (MiFID II)", icon: ShieldCheck },
    ]},
    { label: t("nav.more"), icon: Menu, items: [
      { to: "/onboarding", label: t("nav.onboarding"), icon: GraduationCap },
      { to: "/learn", label: t("nav.learn"), icon: BookOpen },
      { to: "/methodology", label: t("nav.methodology"), icon: ScrollText },
      { to: "/api", label: t("nav.apiWebhooks"), icon: Code2 },
      { to: "/pricing", label: "Pricing", icon: Tag },
      { to: "/settings", label: t("nav.settings"), icon: SettingsIcon },
    ]},
  ];

  const primary = isAdmin
    ? [...PRIMARY, { to: "/admin/audit", label: t("nav.audit"), icon: ScrollText }]
    : PRIMARY;

  const isActive = (to: string) => to === "/" ? pathname === "/" : pathname.startsWith(to);
  const groupActive = (g: Group) => g.items.some(i => isActive(i.to));

  return (
    <nav className="border-b border-border bg-card/70 backdrop-blur-md sticky top-0 z-50">
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 h-14 flex items-center justify-between gap-2">
        {/* Left: brand + mobile menu */}
        <div className="flex items-center gap-2 min-w-0">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[88vw] sm:w-[360px] p-0">
              <SheetHeader className="px-4 py-3 border-b">
                <SheetTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  <span className="text-gradient">FTSE MIB Analytics</span>
                </SheetTitle>
              </SheetHeader>
              <ScrollArea className="h-[calc(100vh-3.25rem)]">
                <div className="p-3 space-y-4">
                  <div className="space-y-0.5">
                    {primary.map(it => (
                      <MobileLink key={it.to} item={it} active={isActive(it.to)} />
                    ))}
                  </div>
                  {GROUPS.map(g => (
                    <div key={g.label}>
                      <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <g.icon className="h-3 w-3" /> {g.label}
                      </div>
                      <div className="space-y-0.5">
                        {g.items.map(it => (
                          <MobileLink key={it.to} item={it} active={isActive(it.to)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>

          <Link to="/" className="flex items-center gap-2 min-w-0">
            <Activity className="h-6 w-6 text-primary shrink-0" />
            <span className="text-base sm:text-lg font-bold text-gradient hidden sm:inline truncate">
              FTSE MIB Analytics
            </span>
          </Link>
        </div>

        {/* Center: desktop nav */}
        <div className="hidden lg:flex items-center gap-1 flex-1 justify-center max-w-3xl">
          {primary.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/"}
              className="px-2.5 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors inline-flex items-center gap-1.5"
              activeClassName="!text-primary bg-primary/10 hover:bg-primary/15"
            >
              <l.icon className="h-3.5 w-3.5" />
              {l.label}
            </NavLink>
          ))}
          {GROUPS.map(g => {
            const active = groupActive(g);
            return (
              <DropdownMenu key={g.label}>
                <DropdownMenuTrigger className={cn(
                  "px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-1.5 outline-none",
                  active
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}>
                  <g.icon className="h-3.5 w-3.5" />
                  {g.label}
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {g.label}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {g.items.map(it => (
                    <DropdownMenuItem key={it.to} asChild>
                      <Link to={it.to} className={cn(
                        "flex items-center gap-2 cursor-pointer",
                        isActive(it.to) && "text-primary font-medium"
                      )}>
                        <it.icon className="h-3.5 w-3.5 opacity-80" />
                        {it.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="hidden md:inline-flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded-md px-2 py-1.5 hover:text-primary hover:border-primary/40 transition-colors"
            title="Search (⌘K)"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Search</span>
            <kbd className="hidden xl:inline-flex items-center gap-0.5 text-[10px] bg-muted px-1 rounded">
              <CommandIcon className="h-2.5 w-2.5" />K
            </kbd>
          </button>
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-primary hover:bg-muted/60 transition-colors"
            title="Search"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
          {user && <NotificationBell />}
          <LanguageSwitcher />
          <AuthButton />
        </div>
      </div>
      <CommandPalette />
    </nav>
  );
};

function MobileLink({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      to={item.to}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-foreground hover:bg-muted/60"
      )}
    >
      <item.icon className="h-4 w-4 opacity-80" />
      {item.label}
    </Link>
  );
}

export default TopNav;