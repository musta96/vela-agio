import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Quote } from "lucide-react";

export interface CitationData {
  quote?: string;
  section?: string;
}

interface Props {
  citation?: CitationData | null;
  sourceUrl?: string;
  label?: string;
}

export function Citation({ citation, sourceUrl, label = "cite" }: Props) {
  if (!citation?.quote && !citation?.section) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          aria-label="View source citation"
        >
          <Quote className="h-2.5 w-2.5" /> {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-xs space-y-2" align="start">
        {citation.section && (
          <div>
            <Badge variant="secondary" className="text-[10px]">{citation.section}</Badge>
          </div>
        )}
        {citation.quote && (
          <blockquote className="border-l-2 border-primary pl-2 italic text-muted-foreground">
            "{citation.quote}"
          </blockquote>
        )}
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline text-[11px] break-all">
            Open source document →
          </a>
        )}
      </PopoverContent>
    </Popover>
  );
}