import { NavLink, useLocation } from "react-router-dom";
import { Home, Compass, Briefcase, Eye, Sparkles, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { useEffect, useRef, useState } from "react";

const ITEMS = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase },
  { to: "/watchlist", label: "Watchlist", icon: Eye },
  { to: "/copilot", label: "AI", icon: Sparkles },
];

/**
 * Native-app-style bottom tab bar, Instagram-inspired:
 *   - Floats above the bottom edge (not flush) so phone curvature never clips icons.
 *   - Honours iOS safe-area on all four insets so corner items stay reachable.
 *   - Icon-only by default; active tab shows a soft pill highlight + label.
 *   - GPU-promoted layer kills the scroll-jitter you get with `position: fixed`
 *     on iOS Safari when the URL bar collapses.
 */
export function MobileBottomNav() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  // Instagram-style shrink-while-scrolling. Pill compresses slightly during scroll
  // and springs back to full size once the user stops.
  const [scrolling, setScrolling] = useState(false);
  const idleTimer = useRef<number | null>(null);
  useEffect(() => {
    const onScroll = () => {
      setScrolling(true);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => setScrolling(false), 180);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, []);

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 pointer-events-none transform-gpu"
      style={{
        paddingBottom: "max(env(safe-area-inset-bottom), 8px)",
        paddingLeft: "max(env(safe-area-inset-left), 12px)",
        paddingRight: "max(env(safe-area-inset-right), 12px)",
        WebkitBackfaceVisibility: "hidden",
      }}
      aria-label="Primary"
    >
      <div
        className={cn(
          "pointer-events-auto mx-auto rounded-[28px] border border-white/15 dark:border-white/10",
          "bg-background/55 supports-[backdrop-filter]:bg-background/40 backdrop-blur-2xl backdrop-saturate-150",
          "shadow-[0_10px_40px_-10px_rgba(0,0,0,0.55)]",
          "transition-[transform,max-width,padding,opacity] duration-300 ease-out will-change-transform",
          scrolling ? "max-w-[19rem] scale-[0.94] opacity-90" : "max-w-md scale-100 opacity-100",
        )}
      >
        <ul className="flex items-stretch justify-between px-2 py-1.5">
          {ITEMS.map(({ to, label, icon: Icon }) => {
            const active = isActive(to);
            return (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 text-[10px] font-medium transition-all",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                  aria-label={label}
                >
                  <span
                    className={cn(
                      "flex items-center justify-center h-9 w-9 rounded-full transition-colors",
                      active && "bg-primary/15",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-[22px] w-[22px] transition-transform",
                        active && "scale-110 drop-shadow-[0_0_6px_hsl(var(--primary)/0.55)]",
                      )}
                      strokeWidth={active ? 2.4 : 1.9}
                    />
                  </span>
                  <span className={cn("leading-none transition-opacity", active ? "opacity-100" : "opacity-0 h-0")}>
                    {label}
                  </span>
                </NavLink>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              onClick={() => setOpenMobile(true)}
              className="relative flex w-full flex-col items-center justify-center gap-0.5 py-1.5 px-1 text-[10px] font-medium text-muted-foreground"
              aria-label="More menu"
            >
              <span className="flex items-center justify-center h-9 w-9 rounded-full">
                <Menu className="h-[22px] w-[22px]" strokeWidth={1.9} />
              </span>
              <span className="opacity-0 h-0 leading-none">More</span>
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}

export default MobileBottomNav;