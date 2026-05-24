import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "ftse-watchlist";

export interface WatchlistItem {
  symbol: string;
  name: string;
  addedAt: number;
}

const read = (): WatchlistItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const write = (items: WatchlistItem[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("watchlist:change"));
};

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>(() => read());

  useEffect(() => {
    const sync = () => setItems(read());
    window.addEventListener("watchlist:change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("watchlist:change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const isWatched = useCallback(
    (symbol: string) => items.some((i) => i.symbol === symbol),
    [items]
  );

  const add = useCallback((symbol: string, name: string) => {
    const current = read();
    if (current.some((i) => i.symbol === symbol)) return;
    write([...current, { symbol, name, addedAt: Date.now() }]);
  }, []);

  const remove = useCallback((symbol: string) => {
    write(read().filter((i) => i.symbol !== symbol));
  }, []);

  const toggle = useCallback(
    (symbol: string, name: string) => {
      if (isWatched(symbol)) {
        remove(symbol);
        return false;
      }
      add(symbol, name);
      return true;
    },
    [isWatched, add, remove]
  );

  return { items, isWatched, add, remove, toggle };
}