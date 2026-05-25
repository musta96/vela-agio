import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Portfolio {
  id: string;
  name: string;
  description: string | null;
  base_currency: string;
  benchmark_symbol: string;
  is_simulation: boolean;
  created_at: string;
}

interface Ctx {
  portfolios: Portfolio[];
  activeId: string | null;
  active: Portfolio | null;
  setActiveId: (id: string) => void;
  loading: boolean;
  refresh: () => Promise<void>;
  create: (input: { name: string; description?: string; base_currency?: string; benchmark_symbol?: string; is_simulation?: boolean; cloneFromId?: string }) => Promise<Portfolio | null>;
  update: (id: string, patch: Partial<Omit<Portfolio, "id" | "created_at">>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const PortfoliosContext = createContext<Ctx | null>(null);
const ACTIVE_KEY = "active_portfolio_id";

export const PortfoliosProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(() => localStorage.getItem(ACTIVE_KEY));
  const [loading, setLoading] = useState(false);
  const ensuredRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!user) { setPortfolios([]); return; }
    setLoading(true);
    const { data } = await (supabase as any)
      .from("portfolios")
      .select("*")
      .order("created_at", { ascending: true });
    if (data) setPortfolios(data as Portfolio[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Ensure user has at least one portfolio
  useEffect(() => {
    if (!user || loading || ensuredRef.current) return;
    if (portfolios.length === 0) {
      ensuredRef.current = true;
      (async () => {
        const { data } = await (supabase as any)
          .from("portfolios")
          .insert({ user_id: user.id, name: "My Portfolio", description: "Default portfolio" })
          .select()
          .single();
        if (data) {
          setPortfolios([data as Portfolio]);
          setActiveId((data as Portfolio).id);
        }
      })();
    } else if (!activeId || !portfolios.find((p) => p.id === activeId)) {
      setActiveId(portfolios[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, portfolios.length, loading]);

  const setActiveId = useCallback((id: string) => {
    setActiveIdState(id);
    localStorage.setItem(ACTIVE_KEY, id);
  }, []);

  const create: Ctx["create"] = async (input) => {
    if (!user) return null;
    const { cloneFromId, ...fields } = input;
    const { data, error } = await (supabase as any)
      .from("portfolios")
      .insert({ user_id: user.id, ...fields })
      .select()
      .single();
    if (error || !data) return null;
    const newP = data as Portfolio;

    if (cloneFromId) {
      const { data: rows } = await (supabase as any)
        .from("portfolio_holdings")
        .select("symbol,name,shares,avg_price,currency")
        .eq("portfolio_id", cloneFromId);
      if (rows && rows.length) {
        await (supabase as any).from("portfolio_holdings").insert(
          rows.map((r: any) => ({
            user_id: user.id,
            portfolio_id: newP.id,
            symbol: r.symbol,
            name: r.name,
            shares: r.shares,
            avg_price: r.avg_price,
            currency: r.currency || "EUR",
          }))
        );
      }
    }

    await refresh();
    setActiveId(newP.id);
    return newP;
  };

  const update: Ctx["update"] = async (id, patch) => {
    await (supabase as any).from("portfolios").update(patch).eq("id", id);
    await refresh();
  };

  const remove: Ctx["remove"] = async (id) => {
    if (portfolios.length <= 1) return;
    await (supabase as any).from("portfolios").delete().eq("id", id);
    if (activeId === id) {
      const next = portfolios.find((p) => p.id !== id);
      if (next) setActiveId(next.id);
    }
    await refresh();
  };

  const active = portfolios.find((p) => p.id === activeId) || null;

  return (
    <PortfoliosContext.Provider
      value={{ portfolios, activeId, active, setActiveId, loading, refresh, create, update, remove }}
    >
      {children}
    </PortfoliosContext.Provider>
  );
};

export const usePortfolios = () => {
  const ctx = useContext(PortfoliosContext);
  if (!ctx) {
    // Safe no-op default so non-wrapped pages don't crash
    return {
      portfolios: [],
      activeId: null,
      active: null,
      setActiveId: () => {},
      loading: false,
      refresh: async () => {},
      create: async () => null,
      update: async () => {},
      remove: async () => {},
    } as Ctx;
  }
  return ctx;
};
