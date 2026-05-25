import { Activity, Command as CommandIcon, ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { AuthButton } from "@/components/AuthButton";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CommandPalette } from "@/components/CommandPalette";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";

export const TopNav = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) { setIsAdmin(false); return; }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setIsAdmin(!!data); });
    return () => { cancelled = true; };
  }, [user]);

  const LINKS = [
    { to: "/", label: t("nav.dashboard") },
    { to: "/copilot", label: t("nav.copilot") },
    { to: "/picks", label: t("nav.aiPicks") },
    { to: "/portfolio", label: t("nav.portfolio") },
    { to: "/macro", label: t("nav.macro") },
  ];
  const GROUPS = [
    { label: t("nav.research"), items: [
      { to: "/compare", label: t("nav.compare") },
      { to: "/sectors", label: t("nav.sectors") },
      { to: "/sentiment", label: t("nav.sentiment") },
      { to: "/technical", label: t("nav.technicals") },
      { to: "/screener", label: t("nav.screener") },
      { to: "/baskets", label: t("nav.baskets") },
      { to: "/filings", label: t("nav.filings") },
      { to: "/earnings", label: t("nav.earnings") },
      { to: "/insider", label: t("nav.insider") },
      { to: "/event-study", label: t("nav.eventStudy") },
    ]},
    { label: t("nav.portfolio"), items: [
      { to: "/watchlist", label: t("nav.watchlist") },
      { to: "/risk", label: t("nav.riskEngine") },
      { to: "/backtest", label: t("nav.backtest") },
      { to: "/tax-harvest", label: t("nav.taxHarvesting") },
      { to: "/goals", label: t("nav.goalsPlanner") },
      { to: "/alerts", label: t("nav.alerts") },
    ]},
    { label: t("nav.more"), items: [
      { to: "/onboarding", label: t("nav.onboarding") },
      { to: "/learn", label: t("nav.learn") },
      { to: "/methodology", label: t("nav.methodology") },
      { to: "/api", label: t("nav.apiWebhooks") },
      { to: "/settings", label: t("nav.settings") },
    ]},
  ];
  const links = isAdmin ? [...LINKS, { to: "/admin/audit", label: t("nav.audit") }] : LINKS;

  return (
    <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center space-x-2 shrink-0">
          <Activity className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold text-gradient hidden sm:inline">FTSE MIB Analytics</span>
        </Link>
        <div className="flex items-center gap-3 lg:gap-5 overflow-x-auto">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/"}
              className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors whitespace-nowrap"
              activeClassName="text-primary"
            >
              {l.label}
            </NavLink>
          ))}
          {GROUPS.map(g => (
            <DropdownMenu key={g.label}>
              <DropdownMenuTrigger className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors whitespace-nowrap inline-flex items-center gap-1">
                {g.label} <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {g.items.map(it => (
                  <DropdownMenuItem key={it.to} asChild>
                    <Link to={it.to}>{it.label}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="hidden md:inline-flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded px-2 py-1 hover:text-primary hover:border-primary/40"
            title="Search (⌘K)"
          >
            <CommandIcon className="h-3 w-3" /> K
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

export default TopNav;