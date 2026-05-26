import { useState } from "react";
import { Settings as SettingsIcon, Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { SEO } from "@/components/SEO";
import { PageHeader } from "@/components/PageHeader";

type Tab = "Profile" | "Fiscal residency" | "Currencies" | "Broker connections" | "Notifications" | "Privacy & data" | "Billing";
const TABS: Tab[] = ["Profile", "Fiscal residency", "Currencies", "Broker connections", "Notifications", "Privacy & data", "Billing"];

const CURRENCIES = [
  { code: "EUR", label: "EUR €" },
  { code: "USD", label: "USD $" },
  { code: "GBP", label: "GBP £" },
  { code: "CHF", label: "CHF" },
];

const BROKERS = [
  { name: "SnapTrade · Degiro", status: "Live", sync: "2 min ago", accounts: 2, action: "Manage" },
  { name: "SnapTrade · Trade Republic", status: "Re-auth needed", sync: "14 days ago", accounts: 1, action: "Reconnect" },
  { name: "Coinbase", status: "Live", sync: "5 min ago", accounts: 1, action: "Manage" },
] as const;

function StatusPill({ s }: { s: string }) {
  const map: Record<string, string> = {
    Live: "bg-success/10 text-success border-success/30",
    "Re-auth needed": "bg-warning/10 text-warning border-warning/30",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${map[s] || "bg-muted text-foreground border-border"}`}>
      {s}
    </span>
  );
}

const Settings = () => {
  const [tab, setTab] = useState<Tab>("Fiscal residency");
  const [baseCcy, setBaseCcy] = useState("EUR");

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <SEO title="Settings — Account, Preferences & Integrations" description="Manage your account, fiscal residency, currencies, broker connections and data." path="/settings" />
      <PageHeader
        icon={SettingsIcon}
        title="Settings"
        description="Account, fiscal residency, currency, broker links, notifications and data."
        actions={
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" /> Export all data
          </Button>
        }
      />

      <div className="grid lg:grid-cols-[240px_1fr] gap-6 items-start">
        {/* Left nav */}
        <Card className="p-3 rounded-2xl">
          <nav className="flex flex-col gap-1">
            {TABS.map((t) => {
              const active = t === tab;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`text-left text-sm px-3 py-2 rounded-lg transition-colors ${active ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:bg-muted/60"}`}
                >
                  {t}
                </button>
              );
            })}
          </nav>
        </Card>

        {/* Right column */}
        <div className="space-y-6">
          <Card className="p-6 rounded-2xl">
            <div className="flex items-start justify-between gap-3 mb-5">
              <h2 className="text-base font-semibold">Fiscal residency</h2>
              <span className="text-xs text-muted-foreground">single source of truth for tax calculations</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Country of residence</label>
                <Input defaultValue="Italy 🇮🇹" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Country of tax residence</label>
                <Input defaultValue="Italy 🇮🇹" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Italian regime · Capital gains <strong className="text-foreground">26%</strong> · Losses carry forward 4 years (Art. 68 TUIR). IVAFE 0.2% on foreign holdings · Bollo titoli applies. This drives Portfolio, Tax and Net Worth calculations.
            </p>
            <Button size="sm" className="mt-5">Save</Button>
          </Card>

          <Card className="p-6 rounded-2xl">
            <h2 className="text-base font-semibold mb-4">Base currency</h2>
            <div className="flex flex-wrap gap-2">
              {CURRENCIES.map((c) => {
                const active = c.code === baseCcy;
                return (
                  <button
                    key={c.code}
                    onClick={() => setBaseCcy(c.code)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${active ? "bg-foreground text-background border-foreground" : "bg-background text-foreground border-border hover:bg-muted/60"}`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold">Broker connections</h2>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" /> Connect broker
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="text-left font-medium pb-3">Broker</th>
                    <th className="text-left font-medium pb-3">Status</th>
                    <th className="text-left font-medium pb-3">Last sync</th>
                    <th className="text-left font-medium pb-3">Accounts</th>
                    <th className="pb-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {BROKERS.map((b) => (
                    <tr key={b.name}>
                      <td className="py-3 font-medium">{b.name}</td>
                      <td className="py-3"><StatusPill s={b.status} /></td>
                      <td className="py-3 text-muted-foreground">{b.sync}</td>
                      <td className="py-3">{b.accounts}</td>
                      <td className="py-3 text-right">
                        <Button variant="outline" size="sm">{b.action}</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Read-only access. Vela never sees passwords. <a className="text-primary hover:underline" href="#">Permissions →</a>
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Settings;
