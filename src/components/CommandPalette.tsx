import { useEffect, useState } from "react";
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
import { BarChart3, Activity, MessageSquare, Sparkles, Briefcase, Star, Settings as SettingsIcon, GitCompare, Grid3x3, Search } from "lucide-react";

const PAGES = [
  { label: "Dashboard", to: "/", icon: BarChart3 },
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

export const CommandPalette = () => {
  const [open, setOpen] = useState(false);
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

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search tickers, pages, actions…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Pages">
          {PAGES.map((p) => (
            <CommandItem key={p.to} onSelect={() => go(p.to)}>
              <p.icon className="mr-2 h-4 w-4" />
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Tickers">
          {STOCK_CATALOG.slice(0, 80).map((s) => (
            <CommandItem
              key={s.symbol}
              value={`${s.symbol} ${s.name}`}
              onSelect={() => go(`/stock/${encodeURIComponent(s.symbol)}`)}
            >
              <Search className="mr-2 h-4 w-4 text-muted-foreground" />
              <span className="font-mono mr-2">{s.symbol}</span>
              <span className="text-muted-foreground text-sm">{s.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{s.market}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};

export default CommandPalette;