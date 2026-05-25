import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { usePlatformControls } from "@/hooks/usePlatformControls";

export function PlatformBannerBar() {
  const { banners, isOn } = usePlatformControls();
  const items = [
    ...(isOn("ai_signals_halted") ? [{ id: "ai", message: "AI signal generation is currently halted by an admin.", severity: "warning" as const }] : []),
    ...(isOn("data_feeds_frozen") ? [{ id: "df", message: "Market data feeds are frozen — prices may be stale.", severity: "warning" as const }] : []),
    ...banners,
  ];
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col">
      {items.map((b) => {
        const tone = b.severity === "critical" ? "bg-destructive/15 text-destructive border-destructive/30"
          : b.severity === "warning" ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
          : "bg-primary/10 text-primary border-primary/30";
        const Icon = b.severity === "critical" ? ShieldAlert : b.severity === "warning" ? AlertTriangle : Info;
        return (
          <div key={b.id} className={`px-4 py-2 text-xs font-medium border-b flex items-center gap-2 ${tone}`}>
            <Icon className="h-3.5 w-3.5 shrink-0" /> <span>{b.message}</span>
          </div>
        );
      })}
    </div>
  );
}