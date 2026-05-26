import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Home, Briefcase, Eye, Filter, Repeat, Sparkles, Bell, Newspaper, Wallet as WalletIcon,
  Lightbulb, Bot, Globe2, ShieldAlert, Wallet, Target, Settings as SettingsIcon, Crown,
  BookOpen, ScrollText, GraduationCap, Handshake, History, User, ShieldCheck, Network, Radar,
  ChevronDown, Banknote, PiggyBank, Bitcoin, Home as HomeIcon, Car, Watch, Building2, Boxes, CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VelaLogo } from "@/components/VelaLogo";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState, useEffect } from "react";

type Item = { title: string; url: string; icon: React.ComponentType<{ className?: string }>; badge?: string };

const MARKETS: Item[] = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Watchlist", url: "/watchlist", icon: Eye },
  { title: "Screener", url: "/screener", icon: Filter },
  { title: "Macro", url: "/macro", icon: Globe2 },
  { title: "Sentiment", url: "/sentiment", icon: Newspaper },
];

const MY_WEALTH_TOP: Item[] = [
  { title: "Portfolio", url: "/portfolio", icon: Briefcase },
  { title: "Orders", url: "/orders", icon: History },
];

const MY_WEALTH_BOTTOM: Item[] = [
  { title: "Goals", url: "/goals", icon: Target },
  { title: "Risk engine", url: "/risk", icon: ShieldAlert },
  { title: "Tax harvest", url: "/tax-harvest", icon: Wallet },
];

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

const LAB: Item[] = [
  { title: "Idea Lab", url: "/picks", icon: Sparkles },
  { title: "AI Scanner", url: "/ai-scanner", icon: Radar, badge: "new" },
  { title: "Portfolio Coach", url: "/advisor", icon: Lightbulb },
  { title: "Research Copilot", url: "/copilot", icon: Bot },
  { title: "Backtesting", url: "/backtest", icon: Repeat },
  { title: "Related Graph", url: "/related", icon: Network, badge: "new" },
  { title: "Deal flow", url: "/dealflow", icon: Handshake, badge: "new" },
  { title: "Alerts", url: "/alerts", icon: Bell },
];

const MORE: Item[] = [
  { title: "Onboarding", url: "/onboarding", icon: GraduationCap },
  { title: "Learn", url: "/learn", icon: BookOpen },
  { title: "Methodology", url: "/methodology", icon: ScrollText },
  { title: "Profile", url: "/profile", icon: User },
  { title: "Security", url: "/security", icon: ShieldCheck },
  { title: "Privacy & data", url: "/privacy-settings", icon: ShieldCheck },
  { title: "Settings", url: "/settings", icon: SettingsIcon },
];

function NavGroup({ label, items }: { label: string; items: Item[] }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const isActive = (url: string) => url === "/" ? pathname === "/" : pathname.startsWith(url);

  return (
    <SidebarGroup>
      {!collapsed && (
        <SidebarGroupLabel className="text-[10px] font-semibold tracking-[0.15em] uppercase text-sidebar-foreground/40 px-4">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((it) => {
            const active = isActive(it.url);
            return (
              <SidebarMenuItem key={it.url}>
                <SidebarMenuButton asChild tooltip={it.title}>
                  <NavLink
                    to={it.url}
                    end={it.url === "/"}
                    className={cn(
                      "flex items-center gap-2.5 rounded-none border-l-2 border-transparent px-4 py-2.5 text-[13px] transition-colors",
                      active
                        ? "border-l-[hsl(var(--sidebar-ring))] bg-[hsl(var(--sidebar-accent))] text-sidebar-foreground"
                        : "text-sidebar-foreground/55 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    )}
                  >
                    <it.icon className="h-4 w-4 shrink-0" />
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
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function NetWorthCollapsible() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const isActive = (url: string) => pathname === url || (url !== "/net-worth" && pathname.startsWith(url));
  const onAnyNW = pathname.startsWith("/net-worth");
  const [open, setOpen] = useState(onAnyNW);
  useEffect(() => { if (onAnyNW) setOpen(true); }, [onAnyNW]);

  if (collapsed) {
    // In icon-collapsed mode, render parent as single icon entry that goes to overview.
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip="Net Worth">
            <NavLink to="/net-worth" className={cn(
              "flex items-center gap-2.5 rounded-none border-l-2 border-transparent px-4 py-2.5 text-[13px]",
              onAnyNW
                ? "border-l-[hsl(var(--sidebar-ring))] bg-[hsl(var(--sidebar-accent))] text-sidebar-foreground"
                : "text-sidebar-foreground/55 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}>
              <WalletIcon className="h-4 w-4 shrink-0" />
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarMenu>
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <button
              className={cn(
                "w-full flex items-center gap-2.5 rounded-none border-l-2 px-4 py-2.5 text-[13px] transition-colors",
                onAnyNW
                  ? "border-l-[hsl(var(--sidebar-ring))] bg-[hsl(var(--sidebar-accent))] text-sidebar-foreground"
                  : "border-transparent text-sidebar-foreground/55 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <WalletIcon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate text-left">Net Worth</span>
              <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">new</span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
        </SidebarMenuItem>
        <CollapsibleContent>
          {NET_WORTH_SUB.map((it) => {
            const active = isActive(it.url);
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

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user } = useAuth();
  const isOwner = (user?.email || "").toLowerCase() === "mustarelli.edoardo@gmail.com";
  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="h-14 flex-row items-center justify-start px-4 border-b border-sidebar-border">
        {collapsed ? <VelaLogo size={22} withWordmark={false} /> : (
          <span className="inline-flex items-center gap-2 text-base font-semibold tracking-tight text-sidebar-foreground">
            <VelaLogo size={22} withWordmark={false} />
            <span>Vela<span className="text-[hsl(var(--sidebar-ring))]">.ai</span></span>
          </span>
        )}
      </SidebarHeader>
      <SidebarContent className="py-3">
        <NavGroup label="Markets" items={MARKETS} />
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] font-semibold tracking-[0.15em] uppercase text-sidebar-foreground/40 px-4">
              My Wealth
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <InlineItems items={MY_WEALTH_TOP} />
            <NetWorthCollapsible />
            <InlineItems items={MY_WEALTH_BOTTOM} />
          </SidebarGroupContent>
        </SidebarGroup>
        <NavGroup label="Lab" items={LAB} />
        <NavGroup label="More" items={MORE} />
        {isOwner && (
          <NavGroup label="Founder" items={[{ title: "Owner Console", url: "/owner", icon: Crown, badge: "you" }]} />
        )}
      </SidebarContent>
      {!collapsed && (
        <SidebarFooter className="border-t border-sidebar-border p-3">
          <div className="rounded-md border border-[hsl(var(--sidebar-ring))]/20 bg-accent/10 px-3 py-2">
            <p className="text-[11px] font-medium text-accent">Pro plan</p>
            <p className="text-[10px] text-sidebar-foreground/40">API · Backtesting · Export</p>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}

export default AppSidebar;