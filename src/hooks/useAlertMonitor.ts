import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useWatchlist } from "@/hooks/useWatchlist";
import { alertStore, type AlertEvent, type AlertRule } from "@/hooks/useAlerts";

const SENTIMENT_INTERVAL_MS = 10 * 60 * 1000; // 10 min

function notify(title: string, body: string) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "granted") {
    try {
      new Notification(title, { body });
    } catch {}
  }
}

function fire(
  rule: AlertRule,
  kind: AlertEvent["kind"],
  message: string,
  value: number,
  threshold: number,
  toast: ReturnType<typeof useToast>["toast"]
) {
  const key = `${rule.id}:${kind}`;
  const fired = alertStore.readFired();
  const now = Date.now();
  if (fired[key] && now - fired[key] < alertStore.cooldownMs) return;
  fired[key] = now;
  alertStore.writeFired(fired);

  const ev: AlertEvent = {
    id: `${key}:${now}`,
    ruleId: rule.id,
    symbol: rule.symbol,
    name: rule.name,
    kind,
    message,
    value,
    threshold,
    at: now,
  };
  alertStore.appendEvent(ev);
  toast({ title: `Alert · ${rule.symbol}`, description: message });
  notify(`${rule.symbol} alert`, message);
}

/**
 * Monitors watchlist symbols against alert rules.
 * - Price + % change: evaluated whenever live quotes refresh.
 * - Sentiment: polled via analyze-sentiment edge function every 10 minutes.
 */
export function useAlertMonitor() {
  const { toast } = useToast();
  const { items } = useWatchlist();
  const symbols = items.map((i) => i.symbol);
  const { quotes } = useLiveQuotes(symbols, 30000);
  const sentimentTimer = useRef<number | null>(null);

  // Ask for browser notification permission once
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Price + change monitor
  useEffect(() => {
    const rules = alertStore.readRules().filter((r) => r.enabled);
    for (const rule of rules) {
      const q = quotes[rule.symbol];
      if (!q) continue;
      if (typeof rule.priceAbove === "number" && q.price >= rule.priceAbove) {
        fire(rule, "price-above", `Price ${q.price.toFixed(2)} ≥ ${rule.priceAbove.toFixed(2)}`, q.price, rule.priceAbove, toast);
      }
      if (typeof rule.priceBelow === "number" && q.price <= rule.priceBelow) {
        fire(rule, "price-below", `Price ${q.price.toFixed(2)} ≤ ${rule.priceBelow.toFixed(2)}`, q.price, rule.priceBelow, toast);
      }
      if (typeof rule.changeUpPct === "number" && q.change >= rule.changeUpPct) {
        fire(rule, "change-up", `Up ${q.change.toFixed(2)}% today (≥ ${rule.changeUpPct}%)`, q.change, rule.changeUpPct, toast);
      }
      if (typeof rule.changeDownPct === "number" && q.change <= -Math.abs(rule.changeDownPct)) {
        fire(rule, "change-down", `Down ${q.change.toFixed(2)}% today (≤ -${rule.changeDownPct}%)`, q.change, -Math.abs(rule.changeDownPct), toast);
      }
    }
  }, [quotes, toast]);

  // Sentiment polling
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const rules = alertStore.readRules().filter(
        (r) => r.enabled && (typeof r.sentimentAbove === "number" || typeof r.sentimentBelow === "number")
      );
      for (const rule of rules) {
        if (cancelled) return;
        try {
          const { data, error } = await supabase.functions.invoke("analyze-sentiment", {
            body: { symbol: rule.symbol, name: rule.name },
          });
          if (error || !data || typeof data.score !== "number") continue;
          const score = data.score as number;
          if (typeof rule.sentimentAbove === "number" && score >= rule.sentimentAbove) {
            fire(rule, "sentiment-bullish", `Sentiment ${score}/100 - ${data.label || "bullish"}`, score, rule.sentimentAbove, toast);
          }
          if (typeof rule.sentimentBelow === "number" && score <= rule.sentimentBelow) {
            fire(rule, "sentiment-bearish", `Sentiment ${score}/100 - ${data.label || "bearish"}`, score, rule.sentimentBelow, toast);
          }
        } catch {
          // ignore transient errors
        }
      }
    };
    // Run once on mount, then on interval
    tick();
    sentimentTimer.current = window.setInterval(tick, SENTIMENT_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (sentimentTimer.current) window.clearInterval(sentimentTimer.current);
    };
  }, [symbols.join(","), toast]);
}
