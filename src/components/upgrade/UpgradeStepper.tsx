import { Check } from "lucide-react";

export type UpgradeStepId = "review" | "payment" | "confirm";

/**
 * Shared 3-step upgrade progress indicator, rendered on the review page,
 * the Stripe payment page, and the post-checkout confirmation page so the
 * user sees a consistent position across the whole flow.
 */
export function UpgradeStepper({ current }: { current: UpgradeStepId }) {
  const steps: { id: UpgradeStepId; label: string }[] = [
    { id: "review", label: "Review plan" },
    { id: "payment", label: "Payment" },
    { id: "confirm", label: "Confirmation" },
  ];
  const currentIdx = steps.findIndex((s) => s.id === current);
  return (
    <ol
      aria-label="Upgrade progress"
      data-testid="upgrade-stepper"
      data-current-step={current}
      className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm"
    >
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <li key={s.id} className="flex items-center gap-2 min-w-0">
            <span
              aria-current={active ? "step" : undefined}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold shrink-0 ${
                done
                  ? "bg-primary text-primary-foreground border-primary"
                  : active
                  ? "bg-primary/10 text-primary border-primary"
                  : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span
              className={`truncate ${
                active ? "font-semibold text-foreground" : done ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={`h-px w-6 sm:w-10 ${i < currentIdx ? "bg-primary" : "bg-border"}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}