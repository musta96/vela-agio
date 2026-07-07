import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { buildShortChecklist, type ShortChecklistInput } from "@/lib/shorts";

/** Compact short-selling risk checklist used on the trade ticket. */
export function ShortRiskChecklist(props: ShortChecklistInput & { className?: string }) {
  const { items, blocking } = buildShortChecklist(props);
  return (
    <div className={props.className}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
        <ShieldAlert className="h-3 w-3" /> Short-sell risk checklist
      </div>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it.id} className="flex items-start gap-2 text-[11px] leading-snug">
            <span className="mt-0.5 shrink-0">
              {it.severity === "ok" && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
              {it.severity === "info" && <Info className="h-3.5 w-3.5 text-muted-foreground" />}
              {it.severity === "warn" && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
              {it.severity === "danger" && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
            </span>
            <span>
              <span className="font-semibold">{it.label}:</span>{" "}
              <span className="text-muted-foreground">{it.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {blocking && (
        <Alert className="mt-2 border-destructive/40 bg-destructive/5 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          <AlertDescription className="text-[11px]">
            Blocking risk: order cannot be simulated until the highlighted issue is resolved.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}