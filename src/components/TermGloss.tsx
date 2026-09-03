import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { glossaryDescription, glossaryLabel, type GlossaryKey } from "@/lib/financeGlossary";

/**
 * Renders a trading term with its localized explanation on hover/focus.
 * The English term of art is preserved (Italian market convention); only the
 * explanation is translated.
 */
export function TermGloss({
  term,
  children,
  className = "",
}: {
  term: GlossaryKey;
  children?: React.ReactNode;
  className?: string;
}) {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className={`underline decoration-dotted decoration-muted-foreground/60 underline-offset-2 cursor-help ${className}`}
          >
            {children ?? glossaryLabel(term, lang)}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed">
          <p className="font-semibold mb-0.5">{glossaryLabel(term, lang)}</p>
          <p className="text-muted-foreground">{glossaryDescription(term, lang)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
