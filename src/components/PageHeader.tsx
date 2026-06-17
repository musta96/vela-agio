import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

type Props = {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/**
 * v2 unified page header (mockup pack). Square icon chip + bold H1 + subtitle, actions right.
 */
export function PageHeader({ icon: Icon, title, description, actions, className }: Props) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6", className)}>
      <div className="min-w-0 flex items-start gap-4">
        {Icon ? (
          <div className="relative h-10 w-10 shrink-0 rounded-lg gradient-border bg-primary/10 text-primary flex items-center justify-center shadow-[var(--shadow-glass)]">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight leading-tight">{title}</h1>
          {description ? (
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export default PageHeader;