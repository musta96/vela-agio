import { Activity } from "lucide-react";
import { Link } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { AuthButton } from "@/components/AuthButton";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const LINKS: { to: string; label: string }[] = [
  { to: "/", label: "Dashboard" },
  { to: "/sentiment", label: "Sentiment" },
  { to: "/technical", label: "Technicals" },
  { to: "/backtest", label: "Backtest" },
  { to: "/picks", label: "AI Picks" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/watchlist", label: "Watchlist" },
  { to: "/settings", label: "Settings" },
];

export const TopNav = () => {
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

  const links = isAdmin ? [...LINKS, { to: "/admin/audit", label: "Audit" }] : LINKS;

  return (
    <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center space-x-2 shrink-0">
          <Activity className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold text-gradient hidden sm:inline">FTSE MIB Analytics</span>
        </Link>
        <div className="flex items-center gap-4 lg:gap-6 overflow-x-auto">
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
          <AuthButton />
        </div>
      </div>
    </nav>
  );
};

export default TopNav;