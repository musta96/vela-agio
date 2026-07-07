import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod";

/**
 * Entry-timing signal engine. Combines technicals (RSI, MACD, SMA20/50/200),
 * fundamentals (post-earnings dip, P/E vs 5y median from deep-analysis),
 * and macro proximity (earnings/policy/CPI windows) into a single verdict.
 *
 * Consumed by:
 *   - the portfolio memo (per-ticker Entry-Timing section)
 *   - the /technical page (TimingCard)
 *   - the Copilot `get_timing_signals` tool
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const BodySchema = z.object({
  symbol: z.string().min(1).max(24),
  lookbackDays: z.number().int().positive().max(1200).optional(),
  lookaheadDays: z.number().int().positive().max(365).optional(),
});

type Direction = "buy" | "wait" | "avoid";
type Family = "tech" | "fund" | "macro";
interface Signal {
  family: Family; key: string; label: string;
  value?: string | number; direction: Direction; weight: number; note?: string;
}
interface TEvent {
  kind: "earnings" | "policy" | "cpi" | "dividend" | "other";
  label: string; date: string; daysUntil: number;
  scope?: "ticker" | "macro"; note?: string;
  sourceLabel?: string; sourceUrl?: string;
  confidence?: "confirmed" | "estimated" | "scheduled";
  confidenceNote?: string;
}

/**
 * Static macro-event calendar used for proximity signals + the per-ticker
 * catalyst calendar. Kept intentionally small: the timing engine only needs
 * "what's the next FOMC / ECB / CPI print within ~30 days". Update
 * quarterly, or wire to a live provider later.
 */
const MACRO_CALENDAR: TEvent[] = [
  { kind: "policy", label: "FOMC rate decision", date: "2026-07-29", daysUntil: 0, scope: "macro",
    sourceLabel: "Federal Reserve calendar", sourceUrl: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
    confidence: "scheduled", confidenceNote: "Date fixed on the FOMC calendar; time set for 2pm ET." },
  { kind: "cpi",    label: "US CPI (June)",       date: "2026-07-15", daysUntil: 0, scope: "macro",
    sourceLabel: "BLS release schedule", sourceUrl: "https://www.bls.gov/schedule/news_release/cpi.htm",
    confidence: "scheduled", confidenceNote: "BLS release, 8:30am ET." },
  { kind: "policy", label: "ECB rate decision",   date: "2026-07-23", daysUntil: 0, scope: "macro",
    sourceLabel: "ECB Governing Council calendar", sourceUrl: "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html",
    confidence: "scheduled" },
  { kind: "cpi",    label: "Euro area CPI flash", date: "2026-07-31", daysUntil: 0, scope: "macro",
    sourceLabel: "Eurostat release calendar", sourceUrl: "https://ec.europa.eu/eurostat/news/release-calendar",
    confidence: "scheduled" },
  { kind: "policy", label: "FOMC rate decision",  date: "2026-09-16", daysUntil: 0, scope: "macro",
    sourceLabel: "Federal Reserve calendar", sourceUrl: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
    confidence: "scheduled" },
  { kind: "cpi",    label: "US CPI (July)",       date: "2026-08-12", daysUntil: 0, scope: "macro",
    sourceLabel: "BLS release schedule", sourceUrl: "https://www.bls.gov/schedule/news_release/cpi.htm",
    confidence: "scheduled" },
];

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function upcomingMacroEvents(now: Date, withinDays = 30): TEvent[] {
  return MACRO_CALENDAR
    .map((e) => ({ ...e, daysUntil: daysBetween(now, new Date(e.date)) }))
    .filter((e) => e.daysUntil >= 0 && e.daysUntil <= withinDays)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

function rsi(c: number[], p = 14): number {
  if (c.length < p + 1) return NaN;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = c[i] - c[i - 1]; if (d >= 0) g += d; else l -= d; }
  let ag = g / p, al = l / p;
  for (let i = p + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    ag = (ag * (p - 1) + (d > 0 ? d : 0)) / p;
    al = (al * (p - 1) + (d < 0 ? -d : 0)) / p;
  }
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

function sma(c: number[], p: number): number {
  if (c.length < p) return NaN;
  let s = 0; for (let i = c.length - p; i < c.length; i++) s += c[i];
  return s / p;
}

function ema(c: number[], p: number): number[] {
  if (!c.length) return [];
  const k = 2 / (p + 1); const o = new Array<number>(c.length); o[0] = c[0];
  for (let i = 1; i < c.length; i++) o[i] = c[i] * k + o[i - 1] * (1 - k);
  return o;
}

function macd(c: number[]): { hist: number; prev: number } {
  if (c.length < 35) return { hist: NaN, prev: NaN };
  const e12 = ema(c, 12); const e26 = ema(c, 26);
  const line = e12.map((v, i) => v - e26[i]);
  const sig = ema(line.slice(25), 9);
  const m = line[line.length - 1], s = sig[sig.length - 1];
  const pm = line[line.length - 2], ps = sig[sig.length - 2];
  return { hist: m - s, prev: pm - ps };
}

async function callEdge<T>(auth: string, fn: string, body: unknown): Promise<T | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    return await r.json() as T;
  } catch { return null; }
}

function score(signals: Signal[]): { score: number; verdict: Direction } {
  const raw = signals.reduce((a, s) => a + (s.direction === "buy" ? s.weight : s.direction === "avoid" ? -s.weight : 0), 0);
  const clamped = Math.max(-100, Math.min(100, Math.round(raw)));
  return { score: clamped, verdict: clamped >= 20 ? "buy" : clamped <= -20 ? "avoid" : "wait" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { symbol, lookaheadDays } = parsed.data;
  const horizonDays = Math.max(1, Math.min(365, lookaheadDays ?? 30));
  const sym = symbol.toUpperCase();
  const auth = req.headers.get("Authorization") ?? `Bearer ${SUPABASE_ANON_KEY}`;

  // Fan out data pulls in parallel.
  const [ohlcRes, fundRes] = await Promise.all([
    callEdge<{ bars?: Array<{ t: number; close: number }> }>(auth, "market-data", { action: "ohlc", symbol: sym, range: "1y", interval: "1d" }),
    callEdge<{ fundamentals?: Record<string, unknown> }>(auth, "deep-analysis", { symbol: sym }).catch(() => null),
  ]);

  const bars = ohlcRes?.bars ?? [];
  const closes = bars.map((b) => Number(b.close)).filter((n) => Number.isFinite(n));

  const signals: Signal[] = [];
  const sources = [
    { label: `Yahoo Finance · ${sym} daily bars`, url: `https://finance.yahoo.com/quote/${encodeURIComponent(sym)}`, retrieved_at: new Date().toISOString() },
  ];
  const events: TEvent[] = [];
  const now = new Date();

  if (closes.length >= 30) {
    const last = closes[closes.length - 1];
    const rV = rsi(closes, 14);
    if (Number.isFinite(rV)) {
      if (rV <= 30) signals.push({ family: "tech", key: "rsi", label: `RSI(14) ${rV.toFixed(0)} — oversold`, value: rV, direction: "buy", weight: 30 });
      else if (rV >= 70) signals.push({ family: "tech", key: "rsi", label: `RSI(14) ${rV.toFixed(0)} — overbought`, value: rV, direction: "avoid", weight: 30 });
      else signals.push({ family: "tech", key: "rsi", label: `RSI(14) ${rV.toFixed(0)} — neutral`, value: rV, direction: "wait", weight: 5 });
    }
    const mc = macd(closes);
    if (Number.isFinite(mc.hist)) {
      if (mc.prev <= 0 && mc.hist > 0) signals.push({ family: "tech", key: "macd", label: "MACD bullish crossover", direction: "buy", weight: 15 });
      else if (mc.prev >= 0 && mc.hist < 0) signals.push({ family: "tech", key: "macd", label: "MACD bearish crossover", direction: "avoid", weight: 15 });
    }
    const s50 = sma(closes, 50), s200 = sma(closes, 200);
    if (Number.isFinite(s50)) signals.push({ family: "tech", key: "sma50", label: `Price ${last > s50 ? "above" : "below"} 50-DMA (${s50.toFixed(2)})`, direction: last > s50 ? "buy" : "avoid", weight: 8 });
    if (Number.isFinite(s200)) signals.push({ family: "tech", key: "sma200", label: `${last > s200 ? "Uptrend — above" : "Downtrend — below"} 200-DMA (${s200.toFixed(2)})`, direction: last > s200 ? "buy" : "avoid", weight: 10 });
  }

  const f = (fundRes?.fundamentals ?? {}) as Record<string, unknown>;
  const pe = Number(f.trailingPE ?? f.forwardPE);
  const median = Number((f as Record<string, unknown>).peFiveYearMedian ?? (f as Record<string, unknown>).peHistoricalMedian);
  if (Number.isFinite(pe) && Number.isFinite(median) && median > 0) {
    const r = pe / median;
    if (r < 0.85) signals.push({ family: "fund", key: "pe-vs-history", label: `P/E ${pe.toFixed(1)} vs 5y median ${median.toFixed(1)} — discount`, direction: "buy", weight: 12 });
    else if (r > 1.15) signals.push({ family: "fund", key: "pe-vs-history", label: `P/E ${pe.toFixed(1)} vs 5y median ${median.toFixed(1)} — premium`, direction: "avoid", weight: 8 });
    sources.push({ label: `${sym} fundamentals (deep-analysis)`, retrieved_at: new Date().toISOString() });
  }

  // Ticker-specific earnings proximity, if the fundamentals payload carries it.
  const nextEarn = Number((f as Record<string, unknown>).daysToNextEarnings);
  if (Number.isFinite(nextEarn) && nextEarn <= 14 && nextEarn >= 0) {
    signals.push({ family: "macro", key: "earnings-soon", label: `Earnings in ${nextEarn.toFixed(0)}d — event risk window`, direction: "wait", weight: 10, note: "Consider staggering entry until after the print." });
  }
  if (Number.isFinite(nextEarn) && nextEarn >= 0 && nextEarn <= horizonDays) {
    const d = new Date(now); d.setDate(d.getDate() + Math.round(nextEarn));
    events.push({
      kind: "earnings", scope: "ticker",
      label: `${sym} earnings`, date: d.toISOString().slice(0, 10), daysUntil: Math.round(nextEarn),
      note: nextEarn <= 14 ? "Elevated event risk — stagger entries around the print." : undefined,
      sourceLabel: `Yahoo Finance · ${sym} earnings`,
      sourceUrl: `https://finance.yahoo.com/calendar/earnings?symbol=${encodeURIComponent(sym)}`,
      confidence: nextEarn <= 7 ? "confirmed" : "estimated",
      confidenceNote: nextEarn <= 7
        ? "Date confirmed by the issuer within the coming week."
        : "Provider estimate — issuers occasionally shift the exact date; confirm on the IR page.",
    });
  }

  // Macro proximity — policy + CPI windows within ~30 days. These affect every
  // ticker, so we always emit them and let the drilldown show the same rows
  // per ticker for transparency.
  const macro = upcomingMacroEvents(now, horizonDays);
  for (const e of macro) events.push(e);
  const nextPolicy = macro.find((e) => e.kind === "policy");
  if (nextPolicy && nextPolicy.daysUntil <= 21) {
    signals.push({
      family: "macro", key: "policy-window",
      label: `${nextPolicy.label} in ${nextPolicy.daysUntil}d`,
      direction: "wait", weight: 6,
      note: "Stagger entries around the decision to avoid vol expansion.",
    });
  }
  const nextCpi = macro.find((e) => e.kind === "cpi");
  if (nextCpi && nextCpi.daysUntil <= 10) {
    signals.push({
      family: "macro", key: "cpi-window",
      label: `${nextCpi.label} in ${nextCpi.daysUntil}d`,
      direction: "wait", weight: 4,
    });
  }

  const { score: sc, verdict } = score(signals);
  const top = [...signals].sort((a, b) => b.weight - a.weight).slice(0, 2).map((s) => s.label);
  const headline = verdict === "buy"
    ? `${sym}: entry window is open — ${top.join("; ")}.`
    : verdict === "avoid"
      ? `${sym}: unfavourable entry — ${top.join("; ")}.`
      : `${sym}: hold off for a cleaner setup — ${top.join("; ") || "insufficient signal to justify an entry today"}.`;

  const out = {
    symbol: sym,
    asOf: new Date().toISOString(),
    verdict, score: sc, headline, signals, sources, events,
  };

  return new Response(JSON.stringify(out), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});