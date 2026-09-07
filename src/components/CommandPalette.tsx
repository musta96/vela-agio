import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { STOCK_CATALOG } from "@/data/stockCatalog";
import { BarChart3, Activity, MessageSquare, Sparkles, Briefcase, Star, Settings as SettingsIcon, GitCompare, Grid3x3, Search, Compass, Loader2, Info } from "lucide-react";

const PAGES = [
  { label: "Dashboard", to: "/", icon: BarChart3 },
  { label: "Explore", to: "/explore", icon: Compass },
  { label: "Compare tickers", to: "/compare", icon: GitCompare },
  { label: "Sector heatmap", to: "/sectors", icon: Grid3x3 },
  { label: "AI Picks", to: "/picks", icon: Sparkles },
  { label: "Sentiment", to: "/sentiment", icon: MessageSquare },
  { label: "Technicals", to: "/technical", icon: Activity },
  { label: "Backtest", to: "/backtest", icon: BarChart3 },
  { label: "Portfolio", to: "/portfolio", icon: Briefcase },
  { label: "Watchlist", to: "/watchlist", icon: Star },
  { label: "Settings", to: "/settings", icon: SettingsIcon },
];

type RemoteResult = { symbol: string; name: string; exchange: string; type: string; currency: string; category?: string };
type PrivateHint = { canonical: string; message: string; related: Array<{ symbol: string; name: string; type: string; category: string }> };

export const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<RemoteResult[]>([]);
  const [privateHint, setPrivateHint] = useState<PrivateHint | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset state when dialog opens/closes so the next session starts clean.
  useEffect(() => {
    if (!open) { setQuery(""); setRemote([]); setPrivateHint(null); }
  }, [open]);

  // Live universal symbol search via Yahoo (covers ~150k instruments: stocks,
  // ETFs, crypto, FX, futures, indices, bonds across every exchange Yahoo
  // tracks). Debounced 300ms, kicks in at ≥2 chars.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setRemote([]); setPrivateHint(null); setLoading(false); return; }
    setLoading(true);
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
        setRemote(((j?.results ?? []) as RemoteResult[]).slice(0, 25));
        setPrivateHint((j?.privateCompanyHint ?? null) as PrivateHint | null);
      } catch { setRemote([]); setPrivateHint(null); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // Merge live results with the local catalog, de-duping by symbol so we don't
  // show the same name twice. Live results take precedence (fresher metadata).
  const tickerResults = useMemo(() => {
    if (query.trim().length < 2) {
      return STOCK_CATALOG.slice(0, 30).map((s) => ({
        symbol: s.symbol, name: s.name, exchange: s.market, type: "Equity", currency: "",
      })) as RemoteResult[];
    }
    const seen = new Set<string>();
    const out: RemoteResult[] = [];
    for (const r of remote) {
      const k = r.symbol.toUpperCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(r);
    }
    // Tail with any local matches we still don't have, so users searching for
    // a name we've curated don't lose them if Yahoo throttles.
    const q = query.trim().toLowerCase();
    for (const s of STOCK_CATALOG) {
      const k = s.symbol.toUpperCase();
      if (seen.has(k)) continue;
      if (s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)) {
        seen.add(k);
        out.push({ symbol: s.symbol, name: s.name, exchange: s.market, type: "Equity", currency: "" });
      }
      if (out.length >= 30) break;
    }
    return out;
  }, [query, remote]);

  // When the user is typing, only keep pages that actually match — otherwise
  // the 11 static pages push live market results below the fold.
  const visiblePages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return PAGES;
    return PAGES.filter((p) => p.label.toLowerCase().includes(q));
  }, [query]);

  const searching = query.trim().length >= 2;

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  // Decide whether Enter can auto-route or whether we should keep the palette
  // open and force the user to disambiguate. We auto-route only when:
  //   - there is no private-company clarification to show, AND
  //   - the top result is a direct company listing (category "company")
  //     whose symbol exactly matches the query, OR there is exactly one
  //     company candidate among the top 3 results.
  const resolveEnter = (): { kind: "navigate"; path: string } | { kind: "disambiguate" } => {
    const q = query.trim();
    if (q.length < 2) return { kind: "disambiguate" };
    if (privateHint) return { kind: "disambiguate" };
    const top = tickerResults.slice(0, 5);
    if (!top.length) return { kind: "navigate", path: `/explore?q=${encodeURIComponent(q)}` };
    const qUpper = q.toUpperCase();
    const exact = top.find((r) => r.symbol.toUpperCase() === qUpper);
    if (exact) return { kind: "navigate", path: `/stock/${encodeURIComponent(exact.symbol)}` };
    const companies = top.filter((r) => (r.category ?? "").toLowerCase() === "company");
    if (companies.length === 1) return { kind: "navigate", path: `/stock/${encodeURIComponent(companies[0].symbol)}` };
    // Multiple plausible matches across asset classes — let the user pick.
    return { kind: "disambiguate" };
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
      <CommandInput
        placeholder="Search any ticker, company, crypto, FX, commodity, index…"
        value={query}
        onValueChange={setQuery}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          const q = query.trim();
          if (q.length < 2) return;
          e.preventDefault();
          e.stopPropagation();
          const decision = resolveEnter();
          if (decision.kind === "navigate") go(decision.path);
          // disambiguate → keep palette open so the user picks a row.
        }}
      />
      <CommandList>
        {privateHint && (
          <div className="px-3 py-2 mx-2 my-2 rounded-md border border-amber-500/30 bg-amber-500/10 text-xs flex gap-2 items-start">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
            <div>
              <div className="font-medium">{privateHint.message}</div>
              {privateHint.related.length === 0 && (
                <div className="text-muted-foreground mt-0.5">No public proxy is currently tracked.</div>
              )}
            </div>
          </div>
        )}
        <CommandEmpty>
          {loading ? (
            <span className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching markets…
            </span>
          ) : query.trim().length < 2 ? (
            "Type at least 2 characters to search."
          ) : (
            <span>
              Nothing matched <span className="font-medium">{query}</span>. Try a different name or ticker.
            </span>
          )}
        </CommandEmpty>
        <CommandGroup heading="Pages">
          {visiblePages.map((p) => (
            <CommandItem key={p.to} value={`page ${p.label}`} onSelect={() => go(p.to)}>
              <p.icon className="mr-2 h-4 w-4" />
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={
          loading
            ? "Markets (searching…)"
            : privateHint
              ? `Related to ${privateHint.canonical}`
              : "Markets"
        }>
          {tickerResults.map((s) => (
            <CommandItem
              key={`${s.symbol}-${s.exchange}`}
              value={`${s.symbol} ${s.name} ${s.exchange} ${s.type} ${s.category ?? ""}`}
              onSelect={() => go(`/stock/${encodeURIComponent(s.symbol)}`)}
            >
              <Search className="mr-2 h-4 w-4 text-muted-foreground" />
              <span className="font-mono mr-2">{s.symbol}</span>
              <span className="text-muted-foreground text-sm truncate">{s.name}</span>
              <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                {[s.category, s.exchange, s.type].filter(Boolean).join(" · ")}
              </span>
            </CommandItem>
          ))}
          {query.trim().length >= 2 && (
            <CommandItem
              value={`explore ${query}`}
              onSelect={() => go(`/explore?q=${encodeURIComponent(query.trim())}`)}
            >
              <Compass className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>Open Explore for "{query.trim()}"</span>
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};

export default CommandPalette;