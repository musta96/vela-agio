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
 * Unified page header. Use as the top element of every page.
 * - Icon: h-6 w-6 text-primary
 * - H1:   text-3xl font-bold tracking-tight
 */
export function PageHeader({ icon: Icon, title, description, actions, className }: Props) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-6", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          {Icon ? <Icon className="h-6 w-6 text-primary shrink-0" /> : null}
          <h1 className="text-3xl font-bold tracking-tight truncate">{title}</h1>
        </div>
        {description ? (
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}

export default PageHeader;