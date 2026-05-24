import { useCallback, useEffect, useState } from "react";

const RULES_KEY = "ftse-alert-rules";
const HISTORY_KEY = "ftse-alert-history";
const FIRED_KEY = "ftse-alert-fired"; // de-dupe map { ruleId: timestamp }

export interface AlertRule {
  id: string;
  symbol: string;
  name: string;
  // Price thresholds
  priceAbove?: number | null;
  priceBelow?: number | null;
  // Intraday % change thresholds (positive numbers)
  changeUpPct?: number | null;
  changeDownPct?: number | null;
  // Sentiment thresholds (0-100)
  sentimentAbove?: number | null;
  sentimentBelow?: number | null;
  enabled: boolean;
  createdAt: number;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  symbol: string;
  name: string;
  kind: "price-above" | "price-below" | "change-up" | "change-down" | "sentiment-bullish" | "sentiment-bearish";
  message: string;
  value: number;
  threshold: number;
  at: number;
}

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const readRules = (): AlertRule[] => safeParse<AlertRule[]>(localStorage.getItem(RULES_KEY), []);
const writeRules = (rules: AlertRule[]) => {
  localStorage.setItem(RULES_KEY, JSON.stringify(rules));
  window.dispatchEvent(new CustomEvent("alerts:rules"));
};

const readHistory = (): AlertEvent[] => safeParse<AlertEvent[]>(localStorage.getItem(HISTORY_KEY), []);
const writeHistory = (events: AlertEvent[]) => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(events.slice(0, 100)));
  window.dispatchEvent(new CustomEvent("alerts:history"));
};

const readFired = (): Record<string, number> =>
  safeParse<Record<string, number>>(localStorage.getItem(FIRED_KEY), {});
const writeFired = (m: Record<string, number>) => localStorage.setItem(FIRED_KEY, JSON.stringify(m));

const COOLDOWN_MS = 60 * 60 * 1000; // 1h per condition

export function useAlerts() {
  const [rules, setRules] = useState<AlertRule[]>(() => readRules());
  const [history, setHistory] = useState<AlertEvent[]>(() => readHistory());

  useEffect(() => {
    const syncR = () => setRules(readRules());
    const syncH = () => setHistory(readHistory());
    window.addEventListener("alerts:rules", syncR);
    window.addEventListener("alerts:history", syncH);
    window.addEventListener("storage", syncR);
    window.addEventListener("storage", syncH);
    return () => {
      window.removeEventListener("alerts:rules", syncR);
      window.removeEventListener("alerts:history", syncH);
      window.removeEventListener("storage", syncR);
      window.removeEventListener("storage", syncH);
    };
  }, []);

  const getRule = useCallback((symbol: string) => rules.find((r) => r.symbol === symbol), [rules]);

  const upsertRule = useCallback((rule: AlertRule) => {
    const current = readRules();
    const idx = current.findIndex((r) => r.symbol === rule.symbol);
    if (idx >= 0) current[idx] = rule;
    else current.push(rule);
    writeRules(current);
  }, []);

  const removeRule = useCallback((symbol: string) => {
    writeRules(readRules().filter((r) => r.symbol !== symbol));
  }, []);

  const clearHistory = useCallback(() => writeHistory([]), []);

  return { rules, history, getRule, upsertRule, removeRule, clearHistory };
}

// Helpers used by the monitor (outside React state)
export const alertStore = {
  readRules,
  readFired,
  writeFired,
  appendEvent(ev: AlertEvent) {
    writeHistory([ev, ...readHistory()]);
  },
  cooldownMs: COOLDOWN_MS,
};
