import { useCallback, useMemo, useState } from "react";
import { X } from "lucide-react";
import { TickerSearch, type TickerHit } from "@/components/TickerSearch";
import { cn } from "@/lib/utils";

/**
 * TickerMultiSelect — search-and-select replacement for the old
 * "type your tickers comma-separated" inputs.
 *
 * It keeps the same external contract (a comma-separated string) so pages that
 * already parse `value.split(",")` keep working unchanged, while users get a
 * proper typeahead with chips.
 */
type Props = {
  /** Comma-separated symbols. */
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  max?: number;
  disabled?: boolean;
  className?: string;
  id?: string;
};

export function parseSymbols(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

export function TickerMultiSelect({
  value,
  onChange,
  placeholder = "Search any instrument — Apple, SPY, Bitcoin, ENI.MI…",
  max = 25,
  disabled,
  className,
  id,
}: Props) {
  const [query, setQuery] = useState("");
  const symbols = useMemo(() => parseSymbols(value), [value]);
  const atMax = symbols.length >= max;

  const commit = useCallback(
    (next: string[]) => onChange(next.join(",")),
    [onChange],
  );

  const add = useCallback(
    (hit: TickerHit) => {
      const sym = hit.symbol.trim().toUpperCase();
      if (!sym || symbols.includes(sym) || atMax) return;
      commit([...symbols, sym]);
      setQuery("");
    },
    [atMax, commit, symbols],
  );

  const remove = (sym: string) => commit(symbols.filter((s) => s !== sym));

  return (
    <div className={cn("space-y-2", className)}>
      <TickerSearch
        value={query}
        onValueChange={setQuery}
        onSelect={add}
        clearOnSelect
        disabled={disabled || atMax}
        placeholder={atMax ? `Maximum ${max} instruments selected` : placeholder}
        inputClassName={id ? undefined : undefined}
      />
      {symbols.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Selected instruments">
          {symbols.map((sym) => (
            <span
              key={sym}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-xs font-medium"
            >
              {sym}
              <button
                type="button"
                onClick={() => remove(sym)}
                disabled={disabled}
                aria-label={`Remove ${sym}`}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {symbols.length > 1 && (
            <button
              type="button"
              onClick={() => commit([])}
              disabled={disabled}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default TickerMultiSelect;
