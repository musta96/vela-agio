import { ReactNode, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Activity, Users, ShieldCheck, KeyRound, CreditCard,
  DollarSign, AlertTriangle, Flag, ScrollText, MessageSquare, FileText,
  Bot, Database, Scale, FileWarning, Bell, Settings as Cog, Search,
  Power, CircleDot, LifeBuoy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmailRevealProvider, EmailRevealToggle } from "./MaskedEmail";

type Item = { title: string; url: string; icon: any; badge?: string | number; tone?: "danger" | "warn" };

const SECTIONS: { label: string; items: Item[] }[] = [
  { label: "Overview", items: [
    { title: "Dashboard", url: "/owner/dashboard", icon: LayoutDashboard },
    { title: "Live activity", url: "/owner/activity", icon: Activity },
  ]},
  { label: "Users", items: [
    { title: "All users", url: "/owner/users", icon: Users, badge: "12.4k" },
    { title: "Roles & access", url: "/owner/roles", icon: ShieldCheck },
    { title: "API keys", url: "/owner/api-keys", icon: KeyRound },
  ]},
  { label: "Billing", items: [
    { title: "Plans & pricing", url: "/owner/plans", icon: CreditCard },
    { title: "Revenue", url: "/owner/revenue", icon: DollarSign },
    { title: "Failed payments", url: "/owner/failed-payments", icon: AlertTriangle, badge: 8, tone: "warn" },
  ]},
  { label: "Platform", items: [
    { title: "Feature flags", url: "/owner/feature-flags", icon: Flag, badge: "3 off" },
    { title: "Audit log", url: "/owner/audit", icon: ScrollText },
    { title: "Comms & CRM", url: "/owner/comms", icon: MessageSquare },
    { title: "Content & copy", url: "/owner/content", icon: FileText },
    { title: "Support tickets", url: "/owner/tickets", icon: LifeBuoy },
  ]},
  { label: "AI & data", items: [
    { title: "Signal governance", url: "/owner/signals", icon: Bot, badge: 2, tone: "warn" },
    { title: "Data feeds", url: "/owner/data-feeds", icon: Database },
  ]},
  { label: "Compliance", items: [
    { title: "GDPR requests", url: "/owner/gdpr", icon: Scale, badge: 5, tone: "warn" },
    { title: "Legal documents", url: "/owner/legal", icon: FileWarning },
    { title: "Security scan", url: "/owner/security", icon: ShieldCheck },
  ]},
];

function KillSwitchButton() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function trigger() {
    setBusy(true);
    try {
      // Best-effort: flip maintenance_mode platform control
      await supabase.from("platform_controls" as any).upsert({
        key: "maintenance_mode", enabled: true, reason: reason || "Global kill switch engaged",
        value: {}, updated_at: new Date().toISOString(),
      });
      toast.success("Global kill switch engaged");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to engage kill switch");
    } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="w-full flex items-center justify-center gap-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/30 px-3 py-2 text-sm font-semibold">
          <CircleDot className="h-3.5 w-3.5 fill-destructive" />
          Global kill switch
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Engage global kill switch?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          This locks the entire platform. Only admins keep access. All AI signals, emails, and trading flows pause until you disable maintenance mode.
        </p>
        <Textarea placeholder="Reason (logged)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" onClick={trigger} disabled={busy}>
            <Power className="h-4 w-4 mr-1.5" /> Engage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TopBar() {
  const { user } = useAuth();
  const initials = (user?.email || "AL").slice(0, 2).toUpperCase();
  return (
    <header className="h-14 border-b border-border bg-card flex items-center px-6 gap-4 sticky top-0 z-30">
      <div className="relative flex-1 max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          placeholder="Search users, logs, signals…"
          className="w-full h-9 pl-9 pr-12 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center h-5 px-1.5 rounded border border-border bg-muted text-[10px] text-muted-foreground font-mono">⌘K</kbd>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium text-success">
          <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
          All systems operational
        </span>
        <EmailRevealToggle />
        <button className="relative h-9 w-9 grid place-items-center rounded-lg hover:bg-muted">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-destructive" />
        </button>
        <button className="h-9 w-9 grid place-items-center rounded-lg hover:bg-muted"><Cog className="h-4 w-4" /></button>
        <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-semibold">{initials}</div>
      </div>
    </header>
  );
}

function Sidebar() {
  const { pathname } = useLocation();
  return (
    <aside className="w-[232px] shrink-0 h-screen sticky top-0 flex flex-col bg-[hsl(211,91%,9%)] text-[hsl(210,76%,95%)] border-r border-[hsl(211,50%,18%)]">
      <div className="px-5 pt-5 pb-3 flex items-center gap-2">
        <div className="h-7 w-7 rounded bg-gradient-to-br from-primary to-accent grid place-items-center text-[10px] font-bold text-primary-foreground">M</div>
        <span className="font-semibold tracking-tight">Vela<span className="text-muted-foreground">.ai</span></span>
        <span className="ml-auto text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/70">Owner</span>
      </div>
      <div className="px-4 pb-3"><KillSwitchButton /></div>
      <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-4">
        {SECTIONS.map((s) => (
          <div key={s.label}>
            <div className="px-3 pb-1.5 text-[10px] uppercase tracking-[0.12em] text-white/40 font-semibold">{s.label}</div>
            <ul className="space-y-0.5">
              {s.items.map((it) => {
                const active = pathname === it.url || (it.url !== "/owner/dashboard" && pathname.startsWith(it.url));
                return (
                  <li key={it.url}>
                    <NavLink to={it.url} className={cn(
                      "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors",
                      active ? "bg-white/8 text-white font-medium" : "text-white/70 hover:bg-white/5 hover:text-white",
                    )}>
                      <it.icon className={cn("h-4 w-4", active && "text-accent")} />
                      <span className="flex-1">{it.title}</span>
                      {it.badge != null && (
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-mono",
                          it.tone === "warn" ? "bg-destructive/20 text-destructive" : "bg-white/10 text-white/60",
                        )}>{it.badge}</span>
                      )}
                    </NavLink>
                  </li>
                );
              })}
          </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 px-4 py-3 text-[11px]">
        <div className="flex items-center gap-1.5 text-success font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />Owner access
        </div>
        <div className="text-white/40 mt-0.5">All permissions · 2FA active</div>
      </div>
    </aside>
  );
}

export default function OwnerLayout() {
  return (
    <EmailRevealProvider>
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 p-8 max-w-[1600px] w-full mx-auto"><Outlet /></main>
      </div>
    </div>
    </EmailRevealProvider>
  );
}

export function OwnerPageHeader({
  title, subtitle, actions,
}: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function KpiStrip({ items }: { items: { label: string; value: ReactNode; sub?: ReactNode; tone?: "up" | "down" | "warn" | "ok" }[] }) {
  const colsClass: Record<number, string> = {
    2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6",
  };
  return (
    <div className={cn(
      "bg-card border border-border rounded-2xl dark:bg-[hsl(var(--surface-glass))] dark:backdrop-blur-xl dark:border-[hsl(var(--border-glass))] dark:shadow-[var(--shadow-glass)] grid grid-cols-2 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border",
      colsClass[items.length] || "lg:grid-cols-4",
    )}>
      {items.map((m) => (
        <div key={m.label} className="p-5 flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">{m.label}</span>
          <div className="text-2xl font-bold tracking-tight">{m.value}</div>
          {m.sub && (
            <div className={cn(
              "text-[11px] font-medium",
              m.tone === "up" && "text-success",
              m.tone === "down" && "text-destructive",
              m.tone === "warn" && "text-warning",
              !m.tone && "text-muted-foreground",
            )}>{m.sub}</div>
          )}
        </div>
      ))}
    </div>
  );
}