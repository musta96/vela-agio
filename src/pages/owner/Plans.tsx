import { OwnerPageHeader } from "@/components/owner/OwnerLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

const PLANS = [
  { name: "Free", price: "€0", sub: "8,087 users", badge: "ACTIVE", badgeClass: "bg-success/15 text-success",
    items: [["5 watchlist items", true], ["Basic market data", true], ["3 AI signals/day", true], ["Backtesting", false], ["API access", false]] },
  { name: "Pro", price: "€49", sub: "3,210 users · €157k ARR", badge: "BEST SELLER", badgeClass: "bg-primary/15 text-primary", highlight: true,
    items: [["Unlimited watchlist", true], ["Full market data", true], ["Unlimited AI signals", true], ["Backtesting", true], ["API access (1k/mo)", true]] },
  { name: "Team", price: "€199", sub: "184 accounts · €44k ARR", badge: "ACTIVE", badgeClass: "bg-success/15 text-success",
    items: [["Everything in Pro", true], ["Up to 10 seats", true], ["API access (10k/mo)", true], ["Shared watchlists", true], ["Priority support", true]] },
  { name: "Enterprise", price: "Custom", sub: "12 accounts · custom pricing", badge: "CUSTOM", badgeClass: "bg-foreground/10 text-foreground", dark: true,
    items: [["Unlimited seats", true], ["Dedicated support", true], ["SLA agreement", true], ["Custom data feeds", true], ["White-label option", true]] },
];

const COUPONS = [
  { code: "VELA20", off: "20% off", valid: "Pro, first 3 months", uses: "84 / 200", exp: "31 Dec 2025" },
  { code: "PRESS50", off: "50% off", valid: "Pro, 1 month", uses: "12 / 20", exp: "30 Jun 2025" },
  { code: "BETA100", off: "100% off", valid: "Pro, 6 months", uses: "8 / 10", exp: "01 Aug 2025" },
];

export default function OwnerPlans() {
  return (
    <>
      <OwnerPageHeader title="Plans & pricing" subtitle="Manage tiers, features, and pricing"
        actions={<><Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1.5" />Add coupon</Button><Button size="sm"><Plus className="h-4 w-4 mr-1.5" />New plan</Button></>}
      />
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLANS.map((p: any) => (
          <div key={p.name} className={cn(
            "rounded-2xl border p-5 flex flex-col",
            p.highlight && "border-primary ring-1 ring-primary",
            p.dark ? "bg-foreground text-background border-foreground" : "bg-card border-border",
          )}>
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <span className={cn("text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded", p.dark ? "bg-background/15 text-background" : p.badgeClass)}>{p.badge}</span>
            </div>
            <div className="text-3xl font-bold tracking-tight">{p.price}{p.price !== "Custom" && <span className="text-sm font-normal text-muted-foreground">/mo</span>}</div>
            <div className={cn("text-xs mt-1", p.dark ? "text-background/70" : "text-muted-foreground")}>{p.sub}</div>
            <ul className={cn("text-sm space-y-1.5 my-5 pt-4 border-t", p.dark ? "border-background/20" : "border-border")}>
              {p.items.map(([label, ok]: any) => (
                <li key={label} className="flex items-center gap-2">
                  {ok ? <Check className="h-4 w-4 text-success shrink-0" /> : <X className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <span className={!ok ? "text-muted-foreground line-through" : ""}>{label}</span>
                </li>
              ))}
            </ul>
            <Button variant={p.highlight ? "default" : p.dark ? "secondary" : "outline"} className="mt-auto">{p.dark ? "Manage" : "Edit plan"}</Button>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-semibold">Active coupons</h3><Button size="sm" variant="outline"><Plus className="h-3.5 w-3.5 mr-1" />New coupon</Button></div>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold"><tr><th className="text-left py-2">Code</th><th className="text-left">Discount</th><th className="text-left">Valid for</th><th className="text-left">Uses</th><th className="text-left">Expires</th></tr></thead>
            <tbody>{COUPONS.map((c) => (
              <tr key={c.code} className="border-t border-border">
                <td className="py-2.5 font-mono">{c.code}</td>
                <td><span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-warning/15 text-warning">{c.off}</span></td>
                <td className="text-xs">{c.valid}</td>
                <td className="text-xs">{c.uses}</td>
                <td className="text-xs text-muted-foreground">{c.exp}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-semibold">Trial configuration</h3><Button size="sm" variant="outline">Save changes</Button></div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <label className="block"><span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">Trial length</span><select className="mt-1 w-full h-9 px-3 rounded-lg border border-border bg-background"><option>14 days</option><option>7 days</option><option>30 days</option></select></label>
            <label className="block"><span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">Trial plan</span><select className="mt-1 w-full h-9 px-3 rounded-lg border border-border bg-background"><option>Pro</option><option>Team</option></select></label>
            <label className="block"><span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">Grace period</span><select className="mt-1 w-full h-9 px-3 rounded-lg border border-border bg-background"><option>3 days</option><option>7 days</option></select></label>
            <label className="block"><span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">Dunning emails</span><select className="mt-1 w-full h-9 px-3 rounded-lg border border-border bg-background"><option>3 attempts</option><option>5 attempts</option></select></label>
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between"><span>Require credit card for trial</span><Switch /></div>
            <div className="flex items-center justify-between"><span>Auto-downgrade on expiry</span><Switch defaultChecked /></div>
          </div>
        </div>
      </div>
    </>
  );
}