import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink, useLocation } from "react-router-dom";
import {
  Home, Briefcase, Eye, Filter, Repeat, Sparkles, Bell, Newspaper, Wallet as WalletIcon,
  Lightbulb, Bot, Globe2, ShieldAlert, Wallet, Target, Settings as SettingsIcon,
  BookOpen, ScrollText, GraduationCap, Handshake, History, User, ShieldCheck, Network, Radar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VelaLogo } from "@/components/VelaLogo";

type Item = { title: string; url: string; icon: React.ComponentType<{ className?: string }>; badge?: string };

const OVERVIEW: Item[] = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Portfolio", url: "/portfolio", icon: Briefcase },
  { title: "Net Worth", url: "/net-worth", icon: WalletIcon, badge: "new" },
  { title: "Watchlist", url: "/watchlist", icon: Eye },
  { title: "Orders", url: "/orders", icon: History },
  { title: "Macro", url: "/macro", icon: Globe2 },
];

const ANALYSIS: Item[] = [
  { title: "Screener", url: "/screener", icon: Filter },
  { title: "Backtesting", url: "/backtest", icon: Repeat },
  { title: "Risk engine", url: "/risk", icon: ShieldAlert },
  { title: "Tax harvest", url: "/tax-harvest", icon: Wallet },
  { title: "Goals", url: "/goals", icon: Target },
];

const INTELLIGENCE: Item[] = [
  { title: "Idea Lab", url: "/picks", icon: Sparkles },
  { title: "Portfolio Coach", url: "/advisor", icon: Lightbulb },
  { title: "Research Copilot", url: "/copilot", icon: Bot },
  { title: "AI Scanner", url: "/ai-scanner", icon: Radar, badge: "new" },
  { title: "Related Graph", url: "/related", icon: Network, badge: "new" },
  { title: "Sentiment", url: "/sentiment", icon: Newspaper },
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

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
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
        <NavGroup label="Overview" items={OVERVIEW} />
        <NavGroup label="Analysis" items={ANALYSIS} />
        <NavGroup label="Intelligence" items={INTELLIGENCE} />
        <NavGroup label="More" items={MORE} />
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