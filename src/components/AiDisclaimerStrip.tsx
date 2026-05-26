import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type Props = {
  variant?: "ai" | "data" | "tax";
  className?: string;
};

const COPY: Record<NonNullable<Props["variant"]>, { label: string; body: string }> = {
  ai: {
    label: "AI-generated",
    body: "Outputs are model estimates, may be wrong or biased, and are not investment advice. Always verify before acting.",
  },
  data: {
    label: "Market data",
    body: "Quotes and fundamentals may be delayed or incomplete. Informational only — not a trading venue.",
  },
  tax: {
    label: "Not tax advice",
    body: "Estimates only. Consult a qualified tax professional before filing or harvesting losses.",
  },
};

export function AiDisclaimerStrip({ variant = "ai", className }: Props) {
  const c = COPY[variant];
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 mb-4",
        className,
      )}
      role="note"
    >
      <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-amber-600 dark:text-amber-500">{c.label}.</span>{" "}
        {c.body}{" "}
        <Link to="/disclaimer" className="text-primary hover:underline">
          Disclaimer
        </Link>
        .
      </p>
    </div>
  );
}

export default AiDisclaimerStrip;