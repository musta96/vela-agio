import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Quote, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export interface CitationData {
  quote?: string;
  section?: string;
}

interface Props {
  citation?: CitationData | null;
  sourceUrl?: string;
  label?: string;
}

function buildContextUrl(sourceUrl: string, citation: CitationData): string {
  // Chrome/Edge text fragments: #:~:text=<url-encoded excerpt>
  // Use a short prefix of the quote for the best chance of matching.
  const raw = (citation.quote ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return sourceUrl;
  // Cap at ~200 chars; drop trailing punctuation. Encode.
  const snippet = raw.slice(0, 200).replace(/[.,;:!?]+$/, "");
  const enc = encodeURIComponent(snippet);
  // If URL already has a fragment, replace it with the text fragment.
  const hashIdx = sourceUrl.indexOf("#");
  const base = hashIdx >= 0 ? sourceUrl.slice(0, hashIdx) : sourceUrl;
  return `${base}#:~:text=${enc}`;
}

export function Citation({ citation, sourceUrl, label = "cite" }: Props) {
  if (!citation?.quote && !citation?.section) return null;
  const contextUrl = sourceUrl && citation?.quote ? buildContextUrl(sourceUrl, citation) : null;
  const openInContext = () => {
    if (!contextUrl) return;
    // Text fragments are Chromium-only; on Safari/Firefox the link still opens
    // to the top of the page. Toast tells the user we highlighted the excerpt.
    window.open(contextUrl, "_blank", "noopener,noreferrer");
    toast.message("Opening SEC filing", { description: "The cited excerpt will be scrolled to and highlighted automatically in Chromium browsers." });
  };
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
        {(contextUrl || sourceUrl) && (
          <div className="flex flex-col gap-1 pt-1 border-t border-border/40">
            {contextUrl && (
              <Button size="sm" variant="default" className="h-7 text-[11px] justify-start" onClick={openInContext}>
                <ExternalLink className="h-3 w-3 mr-1" /> View in context
              </Button>
            )}
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary hover:underline text-[10px] break-all">
                Open full source document →
              </a>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}