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
  ClipboardCheck, Compass, Activity, FlaskConical, ArrowDownFromLine, Users, Calculator,
  GitCompare, Scale, Flame, Zap, CalendarClock, FileText, UserSquare, LineChart, BarChart3,
  StickyNote, FolderOpen, ClipboardList, Coins, Rows3, TrendingUp, Gauge, Users2,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VelaLogo } from "@/components/VelaLogo";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { useRef, useCallback } from "react";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon, X as XIcon } from "lucide-react";
import { getActiveNewBadgeUrls } from "@/lib/sidebarBadges";

/** Map nav-item URLs to their gating feature keys (from feature_catalog). */
const ITEM_FEATURE_KEY: Record<string, string> = {
  "/backtest": "ai.backtests",
  "/strategy-lab": "strategy.proposal_builder",
  "/risk": "portfolio.stress_test",
  "/simulations": "portfolio.simulations",
  "/sentiment": "ai.sentiment",
  "/advisor": "portfolio.doctor",
  "/optimizer": "portfolio.optimizer",
  "/rebalance": "portfolio.rebalance",
  "/event-study": "research.event_study",
  "/tax-harvest": "tax.harvest",
  "/quant": "quant.alpha",
  "/dealflow": "dealflow.access",
  "/api": "enterprise.api",
  "/api-docs": "enterprise.api",
  "/agent-integrations": "enterprise.api",
};

type SidebarGate = ReturnType<typeof useFeatureGate>;
const SidebarGateContext = createContext<SidebarGate | null>(null);

/** Set of URLs that currently qualify for a "new" badge (capped + TTL). */
const NewBadgeContext = createContext<Set<string>>(new Set());
/** Lowercased sidebar search query. Empty string means "no filter". */
const SidebarSearchContext = createContext<string>("");

function useResolvedBadge(it: Item): string | undefined {
  const newBadges = useContext(NewBadgeContext);
  // "new" badges are managed centrally: only render when the manager says so.
  if (it.badge === "new") return newBadges.has(it.url) ? "new" : undefined;
  return it.badge;
}

function matchesSearch(query: string, title: string): boolean {
  if (!query) return true;
  return title.toLowerCase().includes(query);
}

/**
 * Render a nav label with the current search query highlighted. Case-
 * insensitive; renders the original title casing untouched when there is
 * no query or no match.
 */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return <>{text}</>;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return (
    <>
      {before}
      <mark className="bg-accent/30 text-sidebar-foreground rounded-sm px-0.5">
        {match}
      </mark>
      {after}
    </>
  );
}

function useItemLock(url: string): { locked: boolean; planName: string | null } {
  const gate = useContext(SidebarGateContext);
  const key = ITEM_FEATURE_KEY[url];
  if (!gate || !key) return { locked: false, planName: null };
  const inCatalog = gate.catalog.some((c) => c.key === key);
  if (!inCatalog) return { locked: false, planName: null };
  if (gate.has(key)) return { locked: false, planName: null };
  const target = gate.plans.find((p) => (p.feature_keys ?? []).includes(key));
  return { locked: true, planName: target?.name ?? null };
}

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
  /** When no persisted value exists in localStorage and no child route is
   *  active, decides whether the group starts open. Defaults to `false`. */
  defaultOpen?: boolean;
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
    { title: "Portfolio Doctor", url: "/advisor", icon: Lightbulb },
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
  defaultOpen: true,
  items: [
    { title: "Explore", url: "/explore", icon: Compass },
    { title: "Movers", url: "/movers", icon: Activity },
    { title: "Watchlist", url: "/watchlist", icon: Eye },
    { title: "Stock Screener", url: "/screener", icon: Filter },
    { title: "Macro", url: "/macro", icon: Globe2 },
    { title: "Sectors", url: "/sectors", icon: Flame },
    { title: "Compare", url: "/compare", icon: Scale },
  ],
};

const MARKET_DATA: NavGroup = {
  title: "Market data",
  url: "/options",
  icon: LineChart,
  items: [
    { title: "Options", url: "/options", icon: LineChart },
    { title: "Futures", url: "/futures", icon: TrendingUp },
    { title: "Intraday", url: "/intraday", icon: Zap },
    { title: "Baskets", url: "/baskets", icon: Boxes },
    { title: "Corp. Actions", url: "/corporate-actions", icon: CalendarClock },
    { title: "Filings", url: "/filings", icon: FileText },
    { title: "Earnings", url: "/earnings", icon: BarChart3 },
    { title: "Insider", url: "/insider", icon: UserSquare },
    { title: "Credit Spreads", url: "/credit-spreads", icon: Activity },
    { title: "Bond Calculator", url: "/bonds", icon: Calculator },
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
  defaultOpen: true,
  items: [
    { title: "Portfolio", url: "/portfolio", icon: Briefcase },
    { title: "Orders", url: "/orders", icon: History },
    { title: "Goals", url: "/goals", icon: Target },
    { title: "Budget", url: "/budget", icon: PiggyBank },
    { title: "Dividend Planner", url: "/dividends", icon: Coins, badge: "new" },
    { title: "Household", url: "/household", icon: Users2 },
    { title: "Tax-loss Harvesting", url: "/tax-harvest", icon: Wallet },
  ],
};

const ANALYST_TOOLS: NavGroup = {
  title: "Analyst tools",
  url: "/backtest",
  icon: FlaskConical,
  items: [
    { title: "Backtesting", url: "/backtest", icon: Repeat },
    { title: "Strategy Lab", url: "/strategy-lab", icon: FlaskConical, badge: "new" },
    { title: "Optimizer", url: "/optimizer", icon: Gauge },
    { title: "Rebalance", url: "/rebalance", icon: Rows3 },
    { title: "Simulations", url: "/simulations", icon: Activity },
    { title: "Risk Engine", url: "/risk", icon: ShieldAlert },
    { title: "Event Study", url: "/event-study", icon: CalendarClock },
    { title: "Technical", url: "/technical", icon: LineChart },
    { title: "Quant Alpha", url: "/quant", icon: Gauge },
    { title: "Blotter", url: "/blotter", icon: ClipboardList },
    { title: "Peers", url: "/peers", icon: Network },
    { title: "Paper Trading", url: "/paper-trading", icon: FlaskConical },
    { title: "Short Selling", url: "/short-selling", icon: ArrowDownFromLine },
    { title: "Buyback Analyzer", url: "/buybacks", icon: Repeat },
    { title: "ETF Overlap", url: "/etf-overlap", icon: GitCompare },
    { title: "13F Replicator", url: "/replicate", icon: Users },
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
    { title: "Notes", url: "/notes", icon: StickyNote },
    { title: "Documents", url: "/documents", icon: FolderOpen },
    { title: "AI Usage", url: "/ai-usage", icon: Activity },
    { title: "Suitability (MIFID)", url: "/suitability", icon: ClipboardCheck },
    { title: "Security", url: "/security", icon: ShieldCheck },
    { title: "Privacy & data", url: "/privacy-settings", icon: ShieldCheck },
    { title: "Settings", url: "/settings", icon: SettingsIcon },
  ],
};

const NAV_GROUPS: NavGroup[] = [RESEARCH, MARKETS, MARKET_DATA, PORTFOLIO, ANALYST_TOOLS, ASSISTANT, LEARN, ACCOUNT];

const OWNER_ITEM: Item = { title: "Owner Console", url: "/owner", icon: Crown, badge: "you" };

function isRouteActive(pathname: string, url: string) {
  return url === "/" ? pathname === "/" : pathname.startsWith(url);
}

/**
 * Pure breadcrumb resolver: given a pathname, return the sidebar group +
 * page label that should appear at the top of the sidebar. Exported so
 * it can be unit-tested in isolation (see AppSidebar.breadcrumb tests)
 * without rendering the whole sidebar tree.
 *
 * MUST stay in sync with the routes registered under NAV_GROUPS —
 * duplicate labels here would only mask sidebar drift, so we drive
 * everything from the same NAV_GROUPS array the sidebar renders from.
 */
export function computeBreadcrumb(pathname: string): { group: string | null; page: string } | null {
  if (isRouteActive(pathname, DASHBOARD_ITEM.url)) {
    return { group: null, page: DASHBOARD_ITEM.title };
  }
  for (const g of NAV_GROUPS) {
    if (g.title === "Portfolio" && pathname.startsWith("/net-worth")) {
      const nwHit = NET_WORTH_SUB.find((it) => isRouteActive(pathname, it.url));
      if (nwHit) return { group: g.title, page: `Net Worth · ${nwHit.title}` };
    }
    const hit = g.items.find((it) => isRouteActive(pathname, it.url));
    if (hit) return { group: g.title, page: hit.title };
  }
  if (pathname.startsWith("/owner")) return { group: "Founder", page: "Owner Console" };
  return null;
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
  const query = useContext(SidebarSearchContext);
  const visibleSub = query
    ? NET_WORTH_SUB.filter((it) => matchesSearch(query, it.title))
    : NET_WORTH_SUB;
  const parentMatches = !query || matchesSearch(query, "Net Worth");
  if (query && !parentMatches && visibleSub.length === 0) return null;
  const effectiveOpen = query ? true : open;

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
    <Collapsible open={effectiveOpen} onOpenChange={handleOpenChange}>
      <SidebarMenu>
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-expanded={effectiveOpen}
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
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", effectiveOpen && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
        </SidebarMenuItem>
        <CollapsibleContent id="sidebar-group-net-worth" className={COLLAPSIBLE_ANIM}>
          {visibleSub.map((it) => {
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
                    <span className="flex-1 truncate">
                      <HighlightMatch text={it.title} query={query} />
                    </span>
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
  const { locked, planName } = useItemLock(it.url);
  const badge = useResolvedBadge(it);
  const query = useContext(SidebarSearchContext);
  const gate = useContext(SidebarGateContext);
  if (query && !matchesSearch(query, it.title)) return null;

  return (
    <SidebarMenuItem key={it.url}>
      <SidebarMenuButton asChild tooltip={it.title}>
        <NavLink
          to={it.url}
          end={it.url === "/"}
          data-sidebar-nav="item"
          data-sidebar-locked={locked ? "true" : undefined}
          aria-current={active ? "page" : undefined}
          onClick={() => {
            // Locked items are navigable: users can open the page and see
            // the full marketing-style upgrade screen rendered by
            // <RouteFeatureGate>. We intentionally do NOT preventDefault
            // or open the modal here — the destination page owns that UX.
            void locked; void gate;
          }}
          className={cn(
            "flex items-center gap-2.5 rounded-none border-l-2 px-4 py-2.5 text-[13px] transition-colors",
            active
              ? "border-l-[hsl(var(--sidebar-ring))] bg-[hsl(var(--sidebar-accent))] text-sidebar-foreground"
              : "border-transparent text-sidebar-foreground/55 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            indent && "pl-10 pr-4 py-2 text-[12px]",
          )}
        >
          <it.icon className={cn("shrink-0", indent ? "h-3.5 w-3.5" : "h-4 w-4")} />
          {!collapsed && (
            <span className="flex-1 truncate">
              <HighlightMatch text={it.title} query={query} />
            </span>
          )}
          {!collapsed && locked ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                /enterprise/i.test(planName ?? "")
                  ? "bg-[hsl(258_90%_66%/0.18)] text-[hsl(258_95%_82%)] ring-[hsl(258_90%_66%/0.45)]"
                  : "bg-[hsl(38_92%_55%/0.18)] text-[hsl(38_95%_72%)] ring-[hsl(38_92%_55%/0.45)]",
              )}
              title={planName ? `Requires ${planName}` : "Requires upgrade"}
            >
              <Lock className="h-2.5 w-2.5" />
              {planName && <span className="truncate max-w-[64px]">{planName}</span>}
            </span>
          ) : !collapsed && badge ? (
            <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              {badge}
            </span>
          ) : null}
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
  const [open, setOpen] = useState(() =>
    loadGroupOpen(group.title, groupActive || (group.defaultOpen ?? false)),
  );
  const query = useContext(SidebarSearchContext);
  const visibleItems = query
    ? group.items.filter((it) => matchesSearch(query, it.title))
    : group.items;
  if (query && visibleItems.length === 0) return null;
  const effectiveOpen = query ? true : open;

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
      <Collapsible open={effectiveOpen} onOpenChange={handleOpenChange}>
        <SidebarGroupLabel asChild className="px-0">
          <CollapsibleTrigger
            type="button"
            aria-expanded={effectiveOpen}
            data-sidebar-nav="group"
            aria-controls={`sidebar-group-${group.title.toLowerCase()}`}
            className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-semibold tracking-[0.15em] uppercase text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
          >
            <span>{group.title}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", effectiveOpen && "rotate-180")} />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <CollapsibleContent id={`sidebar-group-${group.title.toLowerCase()}`} className={COLLAPSIBLE_ANIM}>
              {visibleItems.map((it) => (
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
  const [open, setOpen] = useState(() =>
    loadGroupOpen(PORTFOLIO.title, groupActive || (PORTFOLIO.defaultOpen ?? false)),
  );
  const query = useContext(SidebarSearchContext);
  const visibleItems = query
    ? PORTFOLIO.items.filter((it) => matchesSearch(query, it.title))
    : PORTFOLIO.items;
  const netWorthMatches = query
    ? matchesSearch(query, "Net Worth") ||
      NET_WORTH_SUB.some((it) => matchesSearch(query, it.title))
    : true;
  if (query && visibleItems.length === 0 && !netWorthMatches) return null;
  const effectiveOpen = query ? true : open;

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
      <Collapsible open={effectiveOpen} onOpenChange={handleOpenChange}>
        <SidebarGroupLabel asChild className="px-0">
          <CollapsibleTrigger
            type="button"
            aria-expanded={effectiveOpen}
            data-sidebar-nav="group"
            aria-controls="sidebar-group-portfolio"
            className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-semibold tracking-[0.15em] uppercase text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
          >
            <span>{PORTFOLIO.title}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", effectiveOpen && "rotate-180")} />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <CollapsibleContent id="sidebar-group-portfolio" className={COLLAPSIBLE_ANIM}>
              {visibleItems.map((it) => (
                <NavItemLink key={it.url} it={it} />
              ))}
              {netWorthMatches && <NetWorthSubMenu />}
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
  const navRef = useRef<HTMLDivElement>(null);
  const gate = useFeatureGate();
  const [searchInput, setSearchInput] = useState("");
  const searchQuery = searchInput.trim().toLowerCase();
  const newBadges = useMemo(() => getActiveNewBadgeUrls(), []);
  const showDashboard = !searchQuery || matchesSearch(searchQuery, DASHBOARD_ITEM.title);

  // Roving keyboard navigation across every visible sidebar link + group trigger.
  // - ArrowDown/ArrowUp: move focus to next/previous item
  // - Home/End: jump to first/last
  // - ArrowRight/ArrowLeft on a group trigger: expand/collapse (Enter/Space still work natively)
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const root = navRef.current;
    if (!root) return;
    const key = e.key;
    if (!["ArrowDown", "ArrowUp", "Home", "End", "ArrowRight", "ArrowLeft"].includes(key)) return;

    const items = Array.from(
      root.querySelectorAll<HTMLElement>('[data-sidebar-nav="item"], [data-sidebar-nav="group"]')
    ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
    if (items.length === 0) return;

    const activeEl = document.activeElement as HTMLElement | null;
    const idx = activeEl ? items.indexOf(activeEl) : -1;

    if (key === "ArrowDown") {
      e.preventDefault();
      const next = items[Math.min(items.length - 1, idx + 1)] ?? items[0];
      next.focus();
    } else if (key === "ArrowUp") {
      e.preventDefault();
      const prev = items[Math.max(0, idx - 1)] ?? items[0];
      prev.focus();
    } else if (key === "Home") {
      e.preventDefault();
      items[0].focus();
    } else if (key === "End") {
      e.preventDefault();
      items[items.length - 1].focus();
    } else if ((key === "ArrowRight" || key === "ArrowLeft") && activeEl?.dataset.sidebarNav === "group") {
      // Toggle expand/collapse via a synthetic click when the user presses arrow keys.
      const expanded = activeEl.getAttribute("aria-expanded") === "true";
      if ((key === "ArrowRight" && !expanded) || (key === "ArrowLeft" && expanded)) {
        e.preventDefault();
        activeEl.click();
      }
    }
  }, []);

  const breadcrumb = useMemo(() => computeBreadcrumb(pathname), [pathname]);

  return (
    <SidebarGateContext.Provider value={gate}>
    <NewBadgeContext.Provider value={newBadges}>
    <SidebarSearchContext.Provider value={searchQuery}>
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
              <nav
                aria-label="Breadcrumb"
                className="mt-0.5 pl-[30px] text-[10px] tracking-wide text-sidebar-foreground/50"
              >
                <ol className="flex items-center gap-1 truncate" role="list">
                  {breadcrumb.group && (
                    <>
                      <li className="truncate">
                        <span className="sr-only">Section: </span>
                        <span aria-hidden="true">{breadcrumb.group}</span>
                      </li>
                      <li aria-hidden="true" className="opacity-60">›</li>
                    </>
                  )}
                  <li className="truncate" aria-current="page">
                    <span className="sr-only">Current page: </span>
                    {breadcrumb.page}
                  </li>
                </ol>
              </nav>
            )}
          </div>
        )}
      </SidebarHeader>
      <SidebarContent
        ref={navRef as any}
        onKeyDown={onKeyDown}
        aria-label="Primary"
        className="py-3"
      >
        {!collapsed && (
          <div className="px-3 pb-2">
            <div className="relative">
              <SearchIcon
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sidebar-foreground/40"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search menu…"
                aria-label="Filter sidebar items"
                className="h-8 pl-8 pr-7 text-[12px] bg-sidebar-accent/30 border-sidebar-border/60 placeholder:text-sidebar-foreground/40"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  aria-label="Clear sidebar search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-sidebar-foreground/50 hover:text-sidebar-foreground"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
        {showDashboard && (
          <SidebarGroup>
            <SidebarMenu>
              <NavItemLink it={DASHBOARD_ITEM} />
            </SidebarMenu>
          </SidebarGroup>
        )}
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
    </SidebarSearchContext.Provider>
    </NewBadgeContext.Provider>
    </SidebarGateContext.Provider>
  );
}

export default AppSidebar;
