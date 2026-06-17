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
import { BarChart3, Activity, MessageSquare, Sparkles, Briefcase, Star, Settings as SettingsIcon, GitCompare, Grid3x3, Search, Compass, Loader2 } from "lucide-react";

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

type RemoteResult = { symbol: string; name: string; exchange: string; type: string; currency: string };

export const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<RemoteResult[]>([]);
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
    if (!open) { setQuery(""); setRemote([]); }
  }, [open]);

  // Live universal symbol search via Yahoo (covers ~150k instruments: stocks,
  // ETFs, crypto, FX, futures, indices, bonds across every exchange Yahoo
  // tracks). Debounced 300ms, kicks in at ≥2 chars.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setRemote([]); setLoading(false); return; }
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
      } catch { setRemote([]); }
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

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search any ticker, company, crypto, FX, commodity, index…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
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
          {PAGES.map((p) => (
            <CommandItem key={p.to} value={`page ${p.label}`} onSelect={() => go(p.to)}>
              <p.icon className="mr-2 h-4 w-4" />
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={loading ? "Markets (searching…)" : "Markets"}>
          {tickerResults.map((s) => (
            <CommandItem
              key={`${s.symbol}-${s.exchange}`}
              value={`${s.symbol} ${s.name} ${s.exchange} ${s.type}`}
              onSelect={() => go(`/stock/${encodeURIComponent(s.symbol)}`)}
            >
              <Search className="mr-2 h-4 w-4 text-muted-foreground" />
              <span className="font-mono mr-2">{s.symbol}</span>
              <span className="text-muted-foreground text-sm truncate">{s.name}</span>
              <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                {[s.exchange, s.type].filter(Boolean).join(" · ")}
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