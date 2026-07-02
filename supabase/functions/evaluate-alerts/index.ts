// Periodically evaluates enabled alert_rules and inserts notifications.
// Triggered by pg_cron every 5 minutes.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function requireCronSecret(req: Request): Response | null {
  const expected = Deno.env.get("CRON_SECRET") ?? "";
  const got = req.headers.get("x-cron-secret") ?? "";
  if (!expected || got !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type Rule = {
  id: string;
  user_id: string;
  kind: string;
  symbol: string | null;
  name: string | null;
  threshold: number | null;
  params: Record<string, unknown>;
  enabled: boolean;
  notify_email_immediate: boolean;
  cooldown_minutes: number;
  last_fired_at: string | null;
};

type Quote = { symbol: string; price: number; change: number; previousClose: number };

async function fetchQuote(symbol: string): Promise<Quote | null> {
  try {
    const url = `${YF_BASE}${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return null;
    const json = await res.json();
    const r = json?.chart?.result?.[0];
    if (!r) return null;
    const meta = r.meta;
    const price = Number(meta?.regularMarketPrice);
    const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose);
    if (!Number.isFinite(price)) return null;
    const change = Number.isFinite(prev) && prev > 0 ? ((price - prev) / prev) * 100 : 0;
    return { symbol, price, change, previousClose: prev };
  } catch {
    return null;
  }
}

async function fetchDailyCloses(symbol: string, range = "1y"): Promise<number[] | null> {
  try {
    const url = `${YF_BASE}${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return null;
    const json = await res.json();
    const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (!Array.isArray(closes)) return null;
    return closes.filter((v: unknown) => Number.isFinite(v)) as number[];
  } catch {
    return null;
  }
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  const avgG = gains / period;
  const avgL = losses / period;
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function macdCross(closes: number[]): "bull" | "bear" | null {
  if (closes.length < 35) return null;
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = ema(macdLine.slice(26), 9);
  const m = macdLine.slice(-2);
  const s = signal.slice(-2);
  if (m.length < 2 || s.length < 2) return null;
  if (m[0] < s[0] && m[1] > s[1]) return "bull";
  if (m[0] > s[0] && m[1] < s[1]) return "bear";
  return null;
}

function maCross(closes: number[]): "golden" | "death" | null {
  if (closes.length < 200) return null;
  const sma = (arr: number[], n: number, idx: number) => {
    let s = 0;
    for (let i = idx - n + 1; i <= idx; i++) s += arr[i];
    return s / n;
  };
  const li = closes.length - 1;
  const ma50Today = sma(closes, 50, li);
  const ma200Today = sma(closes, 200, li);
  const ma50Y = sma(closes, 50, li - 1);
  const ma200Y = sma(closes, 200, li - 1);
  if (ma50Y < ma200Y && ma50Today > ma200Today) return "golden";
  if (ma50Y > ma200Y && ma50Today < ma200Today) return "death";
  return null;
}

function fiftyTwoWeekBreakout(closes: number[]): "high" | "low" | null {
  if (closes.length < 60) return null;
  const window = closes.slice(-252);
  const last = window[window.length - 1];
  const high = Math.max(...window.slice(0, -1));
  const low = Math.min(...window.slice(0, -1));
  if (last >= high) return "high";
  if (last <= low) return "low";
  return null;
}

async function insertNotification(
  rule: Rule,
  title: string,
  body: string,
  severity: "info" | "warning" | "critical",
  payload: Record<string, unknown> = {},
) {
  await supabase.from("notifications").insert({
    user_id: rule.user_id,
    rule_id: rule.id,
    kind: rule.kind,
    symbol: rule.symbol,
    title,
    body,
    severity,
    payload,
  });
  await supabase
    .from("alert_rules")
    .update({ last_fired_at: new Date().toISOString() })
    .eq("id", rule.id);
}

function inCooldown(rule: Rule): boolean {
  if (!rule.last_fired_at) return false;
  const last = new Date(rule.last_fired_at).getTime();
  const cd = (rule.cooldown_minutes ?? 60) * 60 * 1000;
  return Date.now() - last < cd;
}

async function evaluatePortfolioRules(rule: Rule) {
  if (inCooldown(rule)) return;
  const { data: holdings } = await supabase
    .from("portfolio_holdings")
    .select("symbol,name,shares,avg_price")
    .eq("user_id", rule.user_id);
  if (!holdings || holdings.length === 0) return;

  const quoteMap = new Map<string, Quote>();
  for (const h of holdings) {
    const q = await fetchQuote(h.symbol);
    if (q) quoteMap.set(h.symbol, q);
  }

  let totalValue = 0;
  let totalCost = 0;
  const values: { symbol: string; value: number }[] = [];
  for (const h of holdings) {
    const q = quoteMap.get(h.symbol);
    if (!q) continue;
    const v = Number(h.shares) * q.price;
    totalValue += v;
    totalCost += Number(h.shares) * Number(h.avg_price);
    values.push({ symbol: h.symbol, value: v });
  }
  if (totalValue <= 0) return;

  if (rule.kind === "portfolio_drawdown" && rule.threshold != null) {
    const pnlPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
    if (pnlPct <= -Math.abs(Number(rule.threshold))) {
      await insertNotification(
        rule,
        "Portfolio drawdown",
        `Portfolio is down ${pnlPct.toFixed(2)}% vs cost basis (threshold ${rule.threshold}%).`,
        "critical",
        { pnlPct, totalValue, totalCost },
      );
    }
  }

  if (rule.kind === "portfolio_concentration" && rule.threshold != null) {
    const max = values.reduce((m, v) => (v.value > m.value ? v : m), { symbol: "", value: 0 });
    const pct = (max.value / totalValue) * 100;
    if (pct >= Number(rule.threshold)) {
      await insertNotification(
        rule,
        "Concentration risk",
        `${max.symbol} is ${pct.toFixed(1)}% of portfolio (threshold ${rule.threshold}%).`,
        "warning",
        { symbol: max.symbol, pct },
      );
    }
  }
}

async function evaluateSymbolRule(rule: Rule) {
  if (!rule.symbol) return;
  if (inCooldown(rule)) return;

  const k = rule.kind;
  if (k === "price_above" || k === "price_below" || k === "change_up_pct" || k === "change_down_pct") {
    const q = await fetchQuote(rule.symbol);
    if (!q) return;
    if (k === "price_above" && rule.threshold != null && q.price >= Number(rule.threshold)) {
      await insertNotification(rule, `${rule.symbol} above ${rule.threshold}`,
        `Price ${q.price.toFixed(2)} crossed ${rule.threshold}.`, "info", { price: q.price });
    } else if (k === "price_below" && rule.threshold != null && q.price <= Number(rule.threshold)) {
      await insertNotification(rule, `${rule.symbol} below ${rule.threshold}`,
        `Price ${q.price.toFixed(2)} dropped under ${rule.threshold}.`, "warning", { price: q.price });
    } else if (k === "change_up_pct" && rule.threshold != null && q.change >= Number(rule.threshold)) {
      await insertNotification(rule, `${rule.symbol} up ${q.change.toFixed(2)}%`,
        `Daily move ${q.change.toFixed(2)}% ≥ ${rule.threshold}%.`, "info", { change: q.change });
    } else if (k === "change_down_pct" && rule.threshold != null && q.change <= -Math.abs(Number(rule.threshold))) {
      await insertNotification(rule, `${rule.symbol} down ${q.change.toFixed(2)}%`,
        `Daily move ${q.change.toFixed(2)}% (threshold -${Math.abs(Number(rule.threshold))}%).`, "warning", { change: q.change });
    }
    return;
  }

  if (k === "rsi_overbought" || k === "rsi_oversold") {
    const closes = await fetchDailyCloses(rule.symbol, "3mo");
    if (!closes) return;
    const v = rsi(closes, 14);
    if (v == null) return;
    const t = Number(rule.threshold ?? (k === "rsi_overbought" ? 70 : 30));
    if (k === "rsi_overbought" && v >= t) {
      await insertNotification(rule, `${rule.symbol} RSI overbought`,
        `RSI(14) is ${v.toFixed(1)} (≥ ${t}).`, "warning", { rsi: v });
    }
    if (k === "rsi_oversold" && v <= t) {
      await insertNotification(rule, `${rule.symbol} RSI oversold`,
        `RSI(14) is ${v.toFixed(1)} (≤ ${t}).`, "info", { rsi: v });
    }
    return;
  }

  if (k === "macd_cross") {
    const closes = await fetchDailyCloses(rule.symbol, "6mo");
    if (!closes) return;
    const c = macdCross(closes);
    if (c === "bull") {
      await insertNotification(rule, `${rule.symbol} MACD bullish cross`,
        `MACD crossed above signal line.`, "info");
    } else if (c === "bear") {
      await insertNotification(rule, `${rule.symbol} MACD bearish cross`,
        `MACD crossed below signal line.`, "warning");
    }
    return;
  }

  if (k === "ma_cross") {
    const closes = await fetchDailyCloses(rule.symbol, "2y");
    if (!closes) return;
    const c = maCross(closes);
    if (c === "golden") {
      await insertNotification(rule, `${rule.symbol} golden cross`,
        `50-day SMA crossed above 200-day SMA.`, "info");
    } else if (c === "death") {
      await insertNotification(rule, `${rule.symbol} death cross`,
        `50-day SMA crossed below 200-day SMA.`, "warning");
    }
    return;
  }

  if (k === "breakout_52w") {
    const closes = await fetchDailyCloses(rule.symbol, "1y");
    if (!closes) return;
    const b = fiftyTwoWeekBreakout(closes);
    if (b === "high") {
      await insertNotification(rule, `${rule.symbol} 52w high`,
        `Closed at a new 52-week high (${closes[closes.length - 1].toFixed(2)}).`, "info");
    } else if (b === "low") {
      await insertNotification(rule, `${rule.symbol} 52w low`,
        `Closed at a new 52-week low (${closes[closes.length - 1].toFixed(2)}).`, "warning");
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const unauth = requireCronSecret(req);
  if (unauth) return unauth;

  try {
    const { data: rules, error } = await supabase
      .from("alert_rules")
      .select("*")
      .eq("enabled", true)
      .limit(2000);
    if (error) throw error;

    let evaluated = 0;
    for (const rule of (rules ?? []) as Rule[]) {
      try {
        if (rule.kind.startsWith("portfolio_")) {
          await evaluatePortfolioRules(rule);
        } else {
          await evaluateSymbolRule(rule);
        }
        evaluated++;
      } catch (e) {
        console.error("rule failed", rule.id, e);
      }
    }

    // Send immediate emails for critical notifications that have notify_email_immediate=true
    // (handled by separate dispatcher; here we just mark which need it)

    return new Response(JSON.stringify({ ok: true, evaluated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});