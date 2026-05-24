import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<WatchlistItem[]>(() => read());
  const migratedRef = useRef(false);

  useEffect(() => {
    const sync = () => setItems(read());
    window.addEventListener("watchlist:change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("watchlist:change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Cloud sync when signed in: load + migrate local → remote on first login
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      migratedRef.current = false;
      setItems(read());
      return;
    }
    let cancelled = false;
    (async () => {
      // Migrate localStorage items once after sign-in
      if (!migratedRef.current) {
        migratedRef.current = true;
        const local = read();
        if (local.length) {
          await supabase.from("watchlist_items").upsert(
            local.map((i) => ({ user_id: user.id, symbol: i.symbol, name: i.name })),
            { onConflict: "user_id,symbol", ignoreDuplicates: true }
          );
        }
      }
      const { data } = await supabase
        .from("watchlist_items")
        .select("symbol,name,created_at")
        .order("created_at", { ascending: true });
      if (cancelled || !data) return;
      const next: WatchlistItem[] = data.map((r) => ({
        symbol: r.symbol, name: r.name, addedAt: new Date(r.created_at).getTime(),
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setItems(next);
    })();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  // Realtime updates so changes on another device flow in
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`wl-${user.id}`).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "watchlist_items", filter: `user_id=eq.${user.id}` },
      async () => {
        const { data } = await supabase
          .from("watchlist_items")
          .select("symbol,name,created_at")
          .order("created_at", { ascending: true });
        if (!data) return;
        const next: WatchlistItem[] = data.map((r) => ({
          symbol: r.symbol, name: r.name, addedAt: new Date(r.created_at).getTime(),
        }));
        write(next);
      }
    ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const isWatched = useCallback(
    (symbol: string) => items.some((i) => i.symbol === symbol),
    [items]
  );

  const add = useCallback((symbol: string, name: string) => {
    const current = read();
    if (current.some((i) => i.symbol === symbol)) return;
    write([...current, { symbol, name, addedAt: Date.now() }]);
    if (user) {
      supabase.from("watchlist_items")
        .upsert({ user_id: user.id, symbol, name }, { onConflict: "user_id,symbol", ignoreDuplicates: true })
        .then();
    }
  }, [user]);

  const remove = useCallback((symbol: string) => {
    write(read().filter((i) => i.symbol !== symbol));
    if (user) {
      supabase.from("watchlist_items").delete().eq("user_id", user.id).eq("symbol", symbol).then();
    }
  }, [user]);

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