// Daily Market Brief — the free-for-all retention notification.
// Runs hourly via pg_cron. For each user whose preferred local hour == current
// local hour in their timezone, compute a glanceable one-line brief covering:
//   - overall portfolio value change since yesterday
//   - the single biggest mover in the user's portfolio (or watchlist)
//   - one AI insight per mover symbol (cached daily and shared across users)
// Users with no portfolio and no watchlist receive a lighter global-market brief.
//
// Delivery: push (if enabled + subscribed) AND email (if enabled).
// Fully free, on by default for all users, all tiers. No gating.

import { createClient } from "npm:@supabase/supabase-js@2";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Pref = {
  user_id: string;
  daily_brief_enabled: boolean;
  daily_brief_push: boolean;
  daily_brief_email: boolean;
  daily_brief_hour_local: number;
  daily_brief_timezone: string;
  daily_brief_last_sent_on: string | null;
};

// Compute the local hour in a given IANA timezone using Intl. Falls back to UTC.
function localHourInTz(tz: string, now: Date): number {
  try {
    const s = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      hour12: false,
    }).format(now);
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n % 24 : now.getUTCHours();
  } catch {
    return now.getUTCHours();
  }
}

function localDateInTz(tz: string, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    return parts; // YYYY-MM-DD
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

// HTML-escape any user-controlled text (tickers, names, AI insight) before it
// is embedded into outgoing email markup.
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function yahooQuote(symbol: string) {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    );
    if (!r.ok) return null;
    const j = await r.json();
    const q = j?.quoteResponse?.result?.[0];
    if (!q) return null;
    return {
      price: Number(q.regularMarketPrice) || 0,
      prevClose: Number(q.regularMarketPreviousClose) || 0,
      changePct: Number(q.regularMarketChangePercent) || 0,
      currency: q.currency || "USD",
      name: q.shortName || q.longName || symbol,
    };
  } catch {
    return null;
  }
}

function fmtMoney(n: number, ccy: string): string {
  const sign = n >= 0 ? "+" : "−";
  const abs = Math.abs(n);
  const symbol = ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
  return `${sign}${symbol}${abs.toLocaleString("en-US", { maximumFractionDigits: abs < 100 ? 2 : 0 })}`;
}

function fmtPct(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

// One-line Vela sign-offs, rotated by day-of-year so it never feels repetitive.
const SIGNOFFS = [
  "Navigate today with clarity.",
  "Trade the map, not the noise.",
  "Every market, one glance.",
  "Signal first. Then move.",
  "Steady hand, sharp eyes.",
  "Read the tape, keep the plan.",
  "Small moves compound.",
  "The market opens. So do you.",
];
function signOffFor(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00Z");
  const doy = Math.floor(
    (d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000,
  );
  return SIGNOFFS[doy % SIGNOFFS.length];
}

// Ask Lovable AI for a single tight one-liner. Returns null on any failure —
// caller falls back to a rule-based line so the brief always ships.
async function aiOneLiner(symbol: string, name: string, changePct: number): Promise<string | null> {
  if (!LOVABLE_API_KEY) return null;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are Vela.ai's morning brief editor. Write ONE short sentence (max 120 chars) in Vela's brand voice — clear, precise, warm, confident, never hype. Reference the ticker and today's move, and if you know a likely driver mention it in 2–4 words. No emojis. No exclamation marks. No advice.",
          },
          {
            role: "user",
            content: `Symbol: ${symbol}\nName: ${name}\nToday's change: ${fmtPct(changePct)}\nWrite the one-liner.`,
          },
        ],
        max_tokens: 80,
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const line = j?.choices?.[0]?.message?.content?.trim();
    if (!line || line.length > 220) return null;
    return line.replace(/^["'`]+|["'`]+$/g, "");
  } catch {
    return null;
  }
}

async function getCachedInsight(symbol: string, name: string, changePct: number, dateISO: string) {
  const { data: cached } = await supabase
    .from("daily_brief_insights")
    .select("insight")
    .eq("symbol", symbol)
    .eq("as_of_date", dateISO)
    .maybeSingle();
  if (cached?.insight) return cached.insight as string;

  const ai = await aiOneLiner(symbol, name, changePct);
  const fallback = `${symbol} ${fmtPct(changePct)} today.`;
  const insight = ai ?? fallback;
  await supabase
    .from("daily_brief_insights")
    .upsert(
      { symbol, as_of_date: dateISO, change_pct: changePct, insight },
      { onConflict: "symbol,as_of_date" },
    );
  return insight;
}

type BriefPayload = {
  title: string;
  bodyShort: string; // for push
  bodyHtml: string;  // for email
  url: string;
};

async function buildPortfolioBrief(userId: string, dateISO: string): Promise<BriefPayload | null> {
  const { data: holdings } = await supabase
    .from("portfolio_holdings")
    .select("symbol,name,shares,avg_price,currency")
    .eq("user_id", userId);

  const rows = holdings ?? [];
  if (rows.length === 0) return null;

  // Enrich with live quotes (cap to 40 symbols to keep it snappy)
  const symbols = Array.from(new Set(rows.map((r) => r.symbol))).slice(0, 40);
  const quotes = new Map<string, Awaited<ReturnType<typeof yahooQuote>>>();
  await Promise.all(symbols.map(async (s) => quotes.set(s, await yahooQuote(s))));

  let totalNow = 0;
  let totalPrev = 0;
  let biggest: { symbol: string; name: string; changePct: number; deltaValue: number; currency: string } | null = null;

  for (const r of rows) {
    const q = quotes.get(r.symbol);
    if (!q || !q.price || !q.prevClose) continue;
    const shares = Number(r.shares) || 0;
    const now = q.price * shares;
    const prev = q.prevClose * shares;
    totalNow += now;
    totalPrev += prev;
    const deltaValue = now - prev;
    if (!biggest || Math.abs(q.changePct) > Math.abs(biggest.changePct)) {
      biggest = {
        symbol: r.symbol,
        name: r.name ?? q.name,
        changePct: q.changePct,
        deltaValue,
        currency: r.currency || q.currency,
      };
    }
  }

  if (totalNow === 0 || !biggest) return null;

  const totalDelta = totalNow - totalPrev;
  const totalPct = totalPrev > 0 ? (totalDelta / totalPrev) * 100 : 0;
  const ccy = biggest.currency;

  const insight = await getCachedInsight(biggest.symbol, biggest.name, biggest.changePct, dateISO);
  const signoff = signOffFor(dateISO);

  const title = `Portfolio ${fmtPct(totalPct)} today`;
  const bodyShort = `${fmtMoney(totalDelta, ccy)} · ${biggest.symbol} ${fmtPct(biggest.changePct)} — ${insight}`;
  const bodyHtml = `
    <p style="margin:0 0 12px 0;font-size:15px;color:#0f172a">
      Your portfolio is <strong>${fmtPct(totalPct)}</strong> today (${fmtMoney(totalDelta, ccy)}).
    </p>
    <p style="margin:0 0 12px 0;font-size:15px;color:#0f172a">
      Biggest mover: <strong>${esc(biggest.symbol)}</strong> ${fmtPct(biggest.changePct)}.
    </p>
    <p style="margin:0 0 20px 0;font-size:15px;color:#475569">${esc(insight)}</p>
    <p style="margin:0;font-size:13px;color:#64748b;font-style:italic">${esc(signoff)}</p>`;
  return { title, bodyShort, bodyHtml, url: "/portfolio" };
}

async function buildWatchlistBrief(userId: string, dateISO: string): Promise<BriefPayload | null> {
  const { data: items } = await supabase
    .from("watchlist_items")
    .select("symbol,name")
    .eq("user_id", userId);
  const rows = items ?? [];
  if (rows.length === 0) return null;

  const symbols = Array.from(new Set(rows.map((r) => r.symbol))).slice(0, 25);
  const enriched = await Promise.all(
    symbols.map(async (s) => ({ symbol: s, q: await yahooQuote(s) })),
  );
  let biggest: { symbol: string; name: string; changePct: number } | null = null;
  for (const e of enriched) {
    if (!e.q) continue;
    if (!biggest || Math.abs(e.q.changePct) > Math.abs(biggest.changePct)) {
      biggest = { symbol: e.symbol, name: e.q.name, changePct: e.q.changePct };
    }
  }
  if (!biggest) return null;

  const insight = await getCachedInsight(biggest.symbol, biggest.name, biggest.changePct, dateISO);
  const signoff = signOffFor(dateISO);
  const title = `${biggest.symbol} ${fmtPct(biggest.changePct)} today`;
  const bodyShort = `On your watchlist — ${insight}`;
  const bodyHtml = `
    <p style="margin:0 0 12px 0;font-size:15px;color:#0f172a">
      Top mover on your watchlist: <strong>${esc(biggest.symbol)}</strong> ${fmtPct(biggest.changePct)}.
    </p>
    <p style="margin:0 0 20px 0;font-size:15px;color:#475569">${esc(insight)}</p>
    <p style="margin:0;font-size:13px;color:#64748b;font-style:italic">${esc(signoff)}</p>`;
  return { title, bodyShort, bodyHtml, url: "/watchlist" };
}

const GLOBAL_SYMBOLS: { symbol: string; label: string }[] = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^STOXX50E", label: "Euro Stoxx 50" },
  { symbol: "FTSEMIB.MI", label: "FTSE MIB" },
  { symbol: "^N225", label: "Nikkei" },
];

async function buildGlobalBrief(dateISO: string): Promise<BriefPayload> {
  const results = await Promise.all(
    GLOBAL_SYMBOLS.map(async (s) => ({ ...s, q: await yahooQuote(s.symbol) })),
  );
  const parts = results
    .filter((r) => r.q)
    .map((r) => `${r.label} ${fmtPct(r.q!.changePct)}`);
  const line = parts.length > 0 ? parts.join(" · ") : "Markets steady this morning.";
  const signoff = signOffFor(dateISO);
  const title = "Markets this morning";
  const bodyShort = line;
  const bodyHtml = `
    <p style="margin:0 0 12px 0;font-size:15px;color:#0f172a">${line}</p>
    <p style="margin:0 0 12px 0;font-size:14px;color:#475569">
      Add your first ticker to get a personalised brief tomorrow.
    </p>
    <p style="margin:0;font-size:13px;color:#64748b;font-style:italic">${esc(signoff)}</p>`;
  return { title, bodyShort, bodyHtml, url: "/watchlist" };
}

async function sendPush(userId: string, brief: BriefPayload) {
  try {
    await supabase.functions.invoke("send-push", {
      body: {
        user_id: userId,
        title: brief.title,
        body: brief.bodyShort,
        url: brief.url,
        tag: "daily-brief",
      },
      headers: { "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "" },
    });
  } catch (e) {
    console.error("brief push failed", userId, e);
  }
}

async function sendEmail(userId: string, email: string, brief: BriefPayload, dateISO: string) {
  try {
    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#ffffff">
        <h1 style="font-size:20px;color:#0f172a;margin:0 0 16px 0">Your morning brief</h1>
        ${brief.bodyHtml}
        <p style="margin-top:24px">
          <a href="https://vela-agio.lovable.app${brief.url}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:14px">Open Vela.ai</a>
        </p>
        <p style="color:#64748b;font-size:12px;margin-top:24px">
          You're receiving this because your daily brief is on. Turn it off in Settings → Alerts.
        </p>
      </div>`;
    await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "alert-digest",
        recipientEmail: email,
        idempotencyKey: `brief-${userId}-${dateISO}`,
        templateData: { count: 1, html },
      },
    });
  } catch (e) {
    console.error("brief email failed", userId, e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const expected = Deno.env.get("CRON_SECRET") ?? "";
  const got = req.headers.get("x-cron-secret") ?? "";
  if (!expected || got !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = new Date();
  const nowUtcHour = now.getUTCHours();

  // Load candidates: enabled + preferred hour within +/- 3 hours of UTC-now.
  // Cheap prefilter; local-hour math confirms match per user.
  const { data: prefs, error } = await supabase
    .from("alert_preferences")
    .select(
      "user_id, daily_brief_enabled, daily_brief_push, daily_brief_email, daily_brief_hour_local, daily_brief_timezone, daily_brief_last_sent_on",
    )
    .eq("daily_brief_enabled", true);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  let skipped = 0;

  for (const p of (prefs ?? []) as Pref[]) {
    const tz = p.daily_brief_timezone || "UTC";
    const localHour = localHourInTz(tz, now);
    if (localHour !== p.daily_brief_hour_local) {
      skipped++;
      continue;
    }
    const localDate = localDateInTz(tz, now);
    if (p.daily_brief_last_sent_on === localDate) {
      skipped++;
      continue; // already sent today for this user
    }

    // Build the brief
    let brief =
      (await buildPortfolioBrief(p.user_id, localDate)) ??
      (await buildWatchlistBrief(p.user_id, localDate)) ??
      (await buildGlobalBrief(localDate));

    // Fetch user email once
    let email: string | null = null;
    if (p.daily_brief_email) {
      const { data: userInfo } = await supabase.auth.admin.getUserById(p.user_id);
      email = userInfo?.user?.email ?? null;
    }

    // Fire deliveries in parallel
    const jobs: Promise<unknown>[] = [];
    if (p.daily_brief_push) jobs.push(sendPush(p.user_id, brief));
    if (p.daily_brief_email && email) jobs.push(sendEmail(p.user_id, email, brief, localDate));
    await Promise.all(jobs);

    await supabase
      .from("alert_preferences")
      .update({ daily_brief_last_sent_on: localDate })
      .eq("user_id", p.user_id);

    sent++;
  }

  return new Response(
    JSON.stringify({ ok: true, utcHour: nowUtcHour, considered: prefs?.length ?? 0, sent, skipped }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});