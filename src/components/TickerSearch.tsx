import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Sparkles, X } from "lucide-react";
import { STOCK_CATALOG } from "@/data/stockCatalog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { classifyInstrument, INSTRUMENT_BADGE, INSTRUMENT_LABEL } from "@/lib/instrumentType";

/**
 * TickerSearch — universal typeahead for any instrument on any exchange.
 *
 * Layered resolution (best signal first):
 *  1. Local STOCK_CATALOG — instant fuzzy match with token-overlap scoring,
 *     so common queries never wait on the network.
 *  2. Yahoo Finance autocomplete via the `symbol-search` edge function —
 *     covers ~150k instruments worldwide (stocks, ETFs, bonds, funds,
 *     futures, indices, FX, crypto) ranked by category & query similarity
 *     by the function itself.
 *  3. AI fuzzy resolver via the `ai-symbol-finder` edge function — turns
 *     natural-language queries ("the Invesco blockchain ETF on Milan",
 *     "Tesla Frankfurt") into validated Yahoo tickers. Triggered explicitly
 *     so we don't spend AI credits on every keystroke.
 *
 * The component is fully controlled-or-uncontrolled and renders an inline
 * dropdown below the input — no portal — so it composes cleanly inside
 * dialogs, page panels, and tables.
 */

export type TickerHit = {
  symbol: string;
  name: string;
  exchange?: string;
  currency?: string;
  type?: string;
  source: "local" | "yahoo" | "ai";
  confidence?: number;
};

type Props = {
  value?: string;
  onValueChange?: (v: string) => void;
  onSelect: (hit: TickerHit) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  /** When true, hides the "Ask AI" button to keep the surface compact. */
  hideAi?: boolean;
  /** When true, clear the input after a successful selection. */
  clearOnSelect?: boolean;
  id?: string;
};

// Token-overlap fuzzy score. Cheap, no deps, good enough for a catalog of
// a few thousand entries. We weight symbol matches higher than name matches.
function localScore(query: string, sym: string, name: string, market?: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const s = sym.toLowerCase();
  const n = name.toLowerCase();
  let score = 0;
  if (s === q) score += 200;
  else if (s.startsWith(q)) score += 120;
  else if (s.includes(q)) score += 60;
  if (n === q) score += 80;
  else if (n.startsWith(q)) score += 50;
  else if (n.includes(q)) score += 25;
  // Token coverage so "apple inc" matches "Apple Inc."
  const qTokens = q.split(/\s+/).filter(Boolean);
  const nTokens = new Set(n.split(/\s+/));
  let hits = 0;
  for (const t of qTokens) if (nTokens.has(t) || n.includes(t)) hits++;
  if (qTokens.length) score += Math.round((hits / qTokens.length) * 30);
  if (market && market.toLowerCase().includes(q)) score += 5;
  return score;
}

function localMatches(query: string, limit = 6): TickerHit[] {
  const q = query.trim();
  if (q.length < 1) return [];
  const scored = STOCK_CATALOG.map((s) => ({
    hit: {
      symbol: s.symbol,
      name: s.name,
      exchange: s.market,
      currency: (s as any).currency,
      // Catalogue rows carry no explicit type, so classify from symbol + name
      // (ETFs, funds, crypto pairs and FX crosses all live in there too).
      type: classifyInstrument((s as any).type, s.symbol, s.name),
      source: "local" as const,
    } as TickerHit,
    score: localScore(q, s.symbol, s.name, s.market),
  }))
    // Only keep meaningfully strong local hits; weak token overlaps (e.g. the
    // word "tech" in a query) must never outrank real exchange results.
    .filter((x) => x.score >= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((x) => x.hit);
}

type YahooResult = { symbol: string; name: string; exchange: string; type: string; currency: string; category?: string };

export function TickerSearch({
  value,
  onValueChange,
  onSelect,
  placeholder = "Search any instrument — stock, ETF, fund, bond, crypto, FX…",
  autoFocus,
  disabled,
  className,
  inputClassName,
  hideAi,
  clearOnSelect,
  id,
}: Props) {
  const [internal, setInternal] = useState("");
  const query = value ?? internal;
  const setQuery = (v: string) => {
    if (onValueChange) onValueChange(v);
    else setInternal(v);
  };

  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<YahooResult[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [aiHits, setAiHits] = useState<TickerHit[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Debounced Yahoo search.
  useEffect(() => {
    const q = query.trim();
    setAiHits([]);
    setAiError(null);
    if (q.length < 2) {
      setRemote([]);
      setRemoteLoading(false);
      return;
    }
    setRemoteLoading(true);
    const t = setTimeout(async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/symbol-search?q=${encodeURIComponent(q)}`;
        const r = await fetch(url, {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        });
        const j = await r.json();
        setRemote(((j?.results ?? []) as YahooResult[]).slice(0, 20));
      } catch {
        setRemote([]);
      } finally {
        setRemoteLoading(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [query]);

  // Merge local + yahoo, de-dupe by symbol, local first when score is strong.
  const merged = useMemo<TickerHit[]>(() => {
    const out: TickerHit[] = [];
    const seen = new Set<string>();
    for (const h of localMatches(query, 5)) {
      const k = h.symbol.toUpperCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(h);
    }
    for (const r of remote) {
      const k = r.symbol.toUpperCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        symbol: r.symbol,
        name: r.name,
        exchange: r.exchange,
        currency: r.currency,
        type: r.type,
        source: "yahoo",
      });
    }
    for (const a of aiHits) {
      const k = a.symbol.toUpperCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(a);
    }
    return out.slice(0, 25);
  }, [query, remote, aiHits]);

  useEffect(() => { setActiveIdx(0); }, [query, merged.length]);

  const askAi = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-symbol-finder`;
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ query: q }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `AI ${r.status}`);
      const hits: TickerHit[] = (j?.candidates ?? []).map((c: any) => ({
        symbol: c.symbol,
        name: c.name,
        exchange: c.exchange,
        currency: c.currency,
        type: c.type,
        confidence: c.confidence,
        source: "ai" as const,
      }));
      setAiHits(hits);
      if (!hits.length) setAiError("AI didn't find a match. Try adding the exchange, e.g. \"on Milan\".");
    } catch (e: any) {
      setAiError(e?.message || "AI lookup failed");
    } finally {
      setAiLoading(false);
    }
  }, [query]);

  const pick = (h: TickerHit) => {
    onSelect(h);
    if (clearOnSelect) setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(merged.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const hit = merged[activeIdx];
      if (hit) {
        e.preventDefault();
        pick(hit);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showDropdown = open && query.trim().length >= 1;
  const empty = !remoteLoading && merged.length === 0 && query.trim().length >= 2;

  return (
    <div ref={wrapRef} className={cn("relative w-full", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          id={id}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          className={cn("pl-9 pr-9", inputClassName)}
          autoComplete="off"
          spellCheck={false}
        />
        {query && !disabled && (
          <button
            type="button"
            onClick={() => { setQuery(""); setRemote([]); setAiHits([]); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover text-popover-foreground shadow-lg max-h-80 overflow-auto">
          {remoteLoading && merged.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching global exchanges…
            </div>
          )}
          {merged.map((h, i) => (
            <button
              key={`${h.symbol}-${h.exchange ?? ""}-${i}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => pick(h)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                i === activeIdx ? "bg-accent" : "hover:bg-accent/60",
              )}
            >
              <span className="font-mono font-semibold w-20 truncate shrink-0">{h.symbol}</span>
              <span className="truncate text-foreground">{h.name}</span>
              <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                {h.source === "ai" && <Sparkles className="h-3 w-3 text-primary" />}
                {[h.exchange, h.currency].filter(Boolean).join(" · ")}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    INSTRUMENT_BADGE[classifyInstrument(h.type, h.symbol, h.name)],
                  )}
                >
                  {INSTRUMENT_LABEL[classifyInstrument(h.type, h.symbol, h.name)]}
                </span>
              </span>
            </button>
          ))}
          {empty && (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              No direct match for <span className="font-medium">{query}</span>.
            </div>
          )}
          {!hideAi && query.trim().length >= 2 && (
            <div className="border-t border-border p-2 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 text-xs"
                onClick={askAi}
                disabled={aiLoading}
              >
                {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
                Ask AI to find it
              </Button>
              {aiError && <span className="text-[11px] text-muted-foreground truncate">{aiError}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TickerSearch;