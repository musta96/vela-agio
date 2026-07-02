import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Home, Briefcase, Eye, Filter, Repeat, Sparkles, Bell, Newspaper, Wallet as WalletIcon,
  Lightbulb, Bot, Globe2, ShieldAlert, Wallet, Target, Settings as SettingsIcon, Crown,
  BookOpen, ScrollText, GraduationCap, Handshake, History, User, ShieldCheck, Network, Radar,
  ChevronDown, Banknote, PiggyBank, Bitcoin, Home as HomeIcon, Car, Watch, Building2, Boxes, CreditCard,
  ClipboardCheck, Compass, Activity, FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VelaLogo } from "@/components/VelaLogo";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState, useEffect, useMemo } from "react";
import { useRef, useCallback } from "react";

const STORAGE_PREFIX = "vela.sidebar.group.";

// Small helper to give animated Collapsible content a nice, reduced-motion-aware feel.
const COLLAPSIBLE_ANIM =
  "overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up motion-reduce:animate-none";

function loadGroupOpen(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (v === null) return fallback;
    return v === "1";
  } catch {
    return fallback;
  }
}
function saveGroupOpen(key: string, open: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}

type Item = { title: string; url: string; icon: React.ComponentType<{ className?: string }>; badge?: string };

type NavGroup = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  items: Item[];
};

const RESEARCH: NavGroup = {
  title: "Research",
  url: "/ai-scanner",
  icon: Radar,
  items: [
    { title: "AI Radar", url: "/ai-scanner", icon: Radar, badge: "new" },
    { title: "Idea Lab", url: "/picks", icon: Sparkles },
    { title: "Signals", url: "/alerts", icon: Bell },
    { title: "Sentiment", url: "/sentiment", icon: Newspaper },
    { title: "Portfolio Coach", url: "/advisor", icon: Lightbulb },
    { title: "Related Graph", url: "/related", icon: Network },
    { title: "Deal Flow", url: "/dealflow", icon: Handshake },
    { title: "Methodology", url: "/methodology", icon: ScrollText },
  ],
};

const DASHBOARD_ITEM: Item = { title: "Dashboard", url: "/dashboard", icon: Home };

const MARKETS: NavGroup = {
  title: "Markets",
  url: "/explore",
  icon: Globe2,
  items: [
    { title: "Explore", url: "/explore", icon: Compass, badge: "new" },
    { title: "Movers", url: "/movers", icon: Activity, badge: "new" },
    { title: "Watchlist", url: "/watchlist", icon: Eye },
    { title: "Stock Screener", url: "/screener", icon: Filter },
    { title: "Macro", url: "/macro", icon: Globe2 },
  ],
};

const NET_WORTH_SUB: Item[] = [
  { title: "Overview", url: "/net-worth", icon: WalletIcon },
  { title: "Cash & Equivalents", url: "/net-worth/cash", icon: Banknote },
  { title: "Investments", url: "/net-worth/investments", icon: Briefcase },
  { title: "Retirement", url: "/net-worth/retirement", icon: PiggyBank },
  { title: "Crypto", url: "/net-worth/crypto", icon: Bitcoin },
  { title: "Real Estate", url: "/net-worth/real_estate", icon: HomeIcon },
  { title: "Vehicles", url: "/net-worth/vehicles", icon: Car },
  { title: "Watches & Collectibles", url: "/net-worth/collectibles", icon: Watch },
  { title: "Private Equity", url: "/net-worth/private_equity", icon: Building2 },
  { title: "Other Assets", url: "/net-worth/other_assets", icon: Boxes },
  { title: "Liabilities", url: "/net-worth/liabilities", icon: CreditCard },
];

const PORTFOLIO: NavGroup = {
  title: "Portfolio",
  url: "/portfolio",
  icon: Briefcase,
  items: [
    { title: "Portfolio", url: "/portfolio", icon: Briefcase },
    { title: "Orders", url: "/orders", icon: History },
    { title: "Goals", url: "/goals", icon: Target },
    { title: "Tax", url: "/tax-harvest", icon: Wallet },
    { title: "Paper Trading", url: "/paper-trading", icon: FlaskConical, badge: "new" },
    { title: "Backtesting", url: "/backtest", icon: Repeat },
    { title: "Risk Engine", url: "/risk", icon: ShieldAlert },
  ],
};

const ASSISTANT: NavGroup = {
  title: "Assistant",
  url: "/copilot",
  icon: Bot,
  items: [{ title: "AI Assistant", url: "/copilot", icon: Sparkles }],
};

const LEARN: NavGroup = {
  title: "Learn",
  url: "/learn",
  icon: BookOpen,
  items: [
    { title: "Learn", url: "/learn", icon: BookOpen },
    { title: "Onboarding", url: "/onboarding", icon: GraduationCap },
  ],
};

const ACCOUNT: NavGroup = {
  title: "Account",
  url: "/profile",
  icon: User,
  items: [
    { title: "Profile", url: "/profile", icon: User },
    { title: "Plans & billing", url: "/plans-billing", icon: CreditCard },
    { title: "Suitability (MIFID)", url: "/suitability", icon: ClipboardCheck },
    { title: "Security", url: "/security", icon: ShieldCheck },
    { title: "Privacy & data", url: "/privacy-settings", icon: ShieldCheck },
    { title: "Settings", url: "/settings", icon: SettingsIcon },
  ],
};

const NAV_GROUPS: NavGroup[] = [RESEARCH, MARKETS, PORTFOLIO, ASSISTANT, LEARN, ACCOUNT];

const OWNER_ITEM: Item = { title: "Owner Console", url: "/owner", icon: Crown, badge: "you" };

function isRouteActive(pathname: string, url: string) {
  return url === "/" ? pathname === "/" : pathname.startsWith(url);
}

function useGroupActive(pathname: string, group: NavGroup) {
  return group.items.some((it) => isRouteActive(pathname, it.url));
}

function NetWorthSubMenu() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const onAnyNW = pathname.startsWith("/net-worth");
  const [open, setOpen] = useState(() => loadGroupOpen("net-worth", onAnyNW));

  useEffect(() => {
    if (onAnyNW) {
      setOpen(true);
      saveGroupOpen("net-worth", true);
    }
  }, [onAnyNW]);

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    saveGroupOpen("net-worth", v);
  };

  if (collapsed) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip="Net Worth">
            <NavLink
              to="/net-worth"
              className={cn(
                "flex items-center gap-2.5 rounded-none border-l-2 px-4 py-2.5 text-[13px]",
                onAnyNW
                  ? "border-l-[hsl(var(--sidebar-ring))] bg-[hsl(var(--sidebar-accent))] text-sidebar-foreground"
                  : "border-transparent text-sidebar-foreground/55 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <WalletIcon className="h-4 w-4 shrink-0" />
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange}>
      <SidebarMenu>
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-expanded={open}
              data-sidebar-nav="group"
              aria-controls="sidebar-group-net-worth"
              className={cn(
                "w-full flex items-center gap-2.5 rounded-none border-l-2 px-4 py-2.5 text-[13px] transition-colors",
                onAnyNW
                  ? "border-l-[hsl(var(--sidebar-ring))] bg-[hsl(var(--sidebar-accent))] text-sidebar-foreground"
                  : "border-transparent text-sidebar-foreground/55 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <WalletIcon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate text-left">Net Worth</span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
        </SidebarMenuItem>
        <CollapsibleContent id="sidebar-group-net-worth" className={COLLAPSIBLE_ANIM}>
          {NET_WORTH_SUB.map((it) => {
            const active = isRouteActive(pathname, it.url);
            return (
              <SidebarMenuItem key={it.url}>
                <SidebarMenuButton asChild tooltip={it.title}>
                  <NavLink
                    to={it.url}
                    end={it.url === "/net-worth"}
                    className={cn(
                      "flex items-center gap-2.5 rounded-none border-l-2 border-transparent pl-10 pr-4 py-2 text-[12px] transition-colors",
                      active
                        ? "border-l-[hsl(var(--sidebar-ring))] bg-[hsl(var(--sidebar-accent))] text-sidebar-foreground"
                        : "text-sidebar-foreground/50 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    )}
                  >
                    <it.icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1 truncate">{it.title}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </CollapsibleContent>
      </SidebarMenu>
    </Collapsible>
  );
}

function NavItemLink({ it, indent = false }: { it: Item; indent?: boolean }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const active = isRouteActive(pathname, it.url);

  return (
    <SidebarMenuItem key={it.url}>
      <SidebarMenuButton asChild tooltip={it.title}>
        <NavLink
          to={it.url}
          end={it.url === "/"}
          data-sidebar-nav="item"
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-none border-l-2 px-4 py-2.5 text-[13px] transition-colors",
            active
              ? "border-l-[hsl(var(--sidebar-ring))] bg-[hsl(var(--sidebar-accent))] text-sidebar-foreground"
              : "border-transparent text-sidebar-foreground/55 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            indent && "pl-10 pr-4 py-2 text-[12px]",
          )}
        >
          <it.icon className={cn("shrink-0", indent ? "h-3.5 w-3.5" : "h-4 w-4")} />
          {!collapsed && <span className="flex-1 truncate">{it.title}</span>}
          {!collapsed && it.badge && (
            <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              {it.badge}
            </span>
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function CollapsibleNavGroup({ group }: { group: NavGroup }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const groupActive = useGroupActive(pathname, group);
  const [open, setOpen] = useState(() => loadGroupOpen(group.title, groupActive));

  useEffect(() => {
    if (groupActive) {
      setOpen(true);
      saveGroupOpen(group.title, true);
    }
  }, [groupActive, group.title]);

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    saveGroupOpen(group.title, v);
  };

  if (collapsed) {
    return (
      <SidebarGroup>
        <SidebarMenu>
          <NavItemLink it={{ title: group.title, url: group.url, icon: group.icon }} />
        </SidebarMenu>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <Collapsible open={open} onOpenChange={handleOpenChange}>
        <SidebarGroupLabel asChild className="px-0">
          <CollapsibleTrigger
            type="button"
            aria-expanded={open}
            data-sidebar-nav="group"
            aria-controls={`sidebar-group-${group.title.toLowerCase()}`}
            className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-semibold tracking-[0.15em] uppercase text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
          >
            <span>{group.title}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <CollapsibleContent id={`sidebar-group-${group.title.toLowerCase()}`} className={COLLAPSIBLE_ANIM}>
              {group.items.map((it) => (
                <NavItemLink key={it.url} it={it} />
              ))}
            </CollapsibleContent>
          </SidebarMenu>
        </SidebarGroupContent>
      </Collapsible>
    </SidebarGroup>
  );
}

function PortfolioGroup() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const groupActive = useGroupActive(pathname, PORTFOLIO) || pathname.startsWith("/net-worth");
  const [open, setOpen] = useState(() => loadGroupOpen(PORTFOLIO.title, groupActive));

  useEffect(() => {
    if (groupActive) {
      setOpen(true);
      saveGroupOpen(PORTFOLIO.title, true);
    }
  }, [groupActive]);

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    saveGroupOpen(PORTFOLIO.title, v);
  };

  if (collapsed) {
    return (
      <SidebarGroup>
        <SidebarMenu>
          <NavItemLink it={{ title: PORTFOLIO.title, url: PORTFOLIO.url, icon: PORTFOLIO.icon }} />
        </SidebarMenu>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <Collapsible open={open} onOpenChange={handleOpenChange}>
        <SidebarGroupLabel asChild className="px-0">
          <CollapsibleTrigger
            type="button"
            aria-expanded={open}
            data-sidebar-nav="group"
            aria-controls="sidebar-group-portfolio"
            className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-semibold tracking-[0.15em] uppercase text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
          >
            <span>{PORTFOLIO.title}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <CollapsibleContent id="sidebar-group-portfolio" className={COLLAPSIBLE_ANIM}>
              {PORTFOLIO.items.map((it) => (
                <NavItemLink key={it.url} it={it} />
              ))}
              <NetWorthSubMenu />
            </CollapsibleContent>
          </SidebarMenu>
        </SidebarGroupContent>
      </Collapsible>
    </SidebarGroup>
  );
}

function OwnerGroup({ collapsed, isOwner }: { collapsed: boolean; isOwner: boolean }) {
  const { pathname } = useLocation();
  if (!isOwner) return null;
  const active = isRouteActive(pathname, OWNER_ITEM.url);
  return (
    <SidebarGroup>
      {!collapsed && (
        <SidebarGroupLabel className="text-[10px] font-semibold tracking-[0.15em] uppercase text-sidebar-foreground/40 px-4">
          Founder
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={OWNER_ITEM.title}>
              <NavLink
                to={OWNER_ITEM.url}
                className={cn(
                  "flex items-center gap-2.5 rounded-none border-l-2 px-4 py-2.5 text-[13px] transition-colors",
                  active
                    ? "border-l-[hsl(var(--sidebar-ring))] bg-[hsl(var(--sidebar-accent))] text-sidebar-foreground"
                    : "border-transparent text-sidebar-foreground/55 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <OWNER_ITEM.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="flex-1 truncate">{OWNER_ITEM.title}</span>}
                {!collapsed && OWNER_ITEM.badge && (
                  <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                    {OWNER_ITEM.badge}
                  </span>
                )}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user } = useAuth();
  const isOwner = (user?.email || "").toLowerCase() === "mustarelli.edoardo@gmail.com";
  const { pathname } = useLocation();

  const breadcrumb = useMemo(() => {
    if (isRouteActive(pathname, DASHBOARD_ITEM.url)) {
      return { group: null as string | null, page: DASHBOARD_ITEM.title };
    }
    for (const g of NAV_GROUPS) {
      const nwHit = g.title === "Portfolio" && pathname.startsWith("/net-worth")
        ? NET_WORTH_SUB.find((it) => isRouteActive(pathname, it.url))
        : undefined;
      if (nwHit) return { group: g.title, page: `Net Worth · ${nwHit.title}` };
      const hit = g.items.find((it) => isRouteActive(pathname, it.url));
      if (hit) return { group: g.title, page: hit.title };
    }
    if (pathname.startsWith("/owner")) return { group: "Founder", page: "Owner Console" };
    return null;
  }, [pathname]);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border glass-panel">
      <SidebarHeader className="h-14 flex-row items-center justify-start px-4 border-b border-sidebar-border/60">
        {collapsed ? (
          <VelaLogo size={22} withWordmark={false} />
        ) : (
          <div className="flex flex-col min-w-0">
            <span className="inline-flex items-center gap-2 text-base font-semibold tracking-tight text-sidebar-foreground">
              <VelaLogo size={22} withWordmark={false} />
              <span>
                Vela<span className="text-[hsl(var(--sidebar-ring))]">.ai</span>
              </span>
            </span>
            {breadcrumb && (
              <span
                aria-label="Current location"
                className="mt-0.5 pl-[30px] truncate text-[10px] tracking-wide text-sidebar-foreground/50"
              >
                {breadcrumb.group ? `${breadcrumb.group} › ${breadcrumb.page}` : breadcrumb.page}
              </span>
            )}
          </div>
        )}
      </SidebarHeader>
      <SidebarContent className="py-3">
        <SidebarGroup>
          <SidebarMenu>
            <NavItemLink it={DASHBOARD_ITEM} />
          </SidebarMenu>
        </SidebarGroup>
        {NAV_GROUPS.map((group) =>
          group.title === "Portfolio" ? (
            <PortfolioGroup key={group.title} />
          ) : (
            <CollapsibleNavGroup key={group.title} group={group} />
          )
        )}
        <OwnerGroup collapsed={collapsed} isOwner={isOwner} />
      </SidebarContent>
    </Sidebar>
  );
}

export default AppSidebar;
