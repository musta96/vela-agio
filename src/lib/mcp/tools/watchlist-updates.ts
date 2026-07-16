import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { withInstrumentation } from "../lib/instrument";

function sbUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchQuoteSummary(symbol: string) {
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36";
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2d&interval=1d`;
  const qsUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail`;
  try {
    const [cr, sr] = await Promise.all([
      fetch(chartUrl, { headers: { "User-Agent": UA } }),
      fetch(qsUrl, { headers: { "User-Agent": UA } }).catch(() => null),
    ]);
    if (!cr.ok) return null;
    const cj = await cr.json();
    const m = cj?.chart?.result?.[0]?.meta;
    if (!m) return null;
    const price = m.regularMarketPrice ?? m.previousClose;
    const prev = m.previousClose ?? m.chartPreviousClose;
    let dividendYield: number | null = null;
    let dividendRate: number | null = null;
    let exDivDate: string | null = null;
    if (sr && sr.ok) {
      const sj = await sr.json();
      const sd = sj?.quoteSummary?.result?.[0]?.summaryDetail;
      dividendYield = sd?.dividendYield?.raw ?? null;
      dividendRate = sd?.dividendRate?.raw ?? null;
      const ex = sd?.exDividendDate?.raw;
      exDivDate = ex ? new Date(ex * 1000).toISOString().slice(0, 10) : null;
    }
    return {
      symbol: m.symbol ?? symbol,
      name: m.shortName ?? m.longName ?? symbol,
      price,
      change: prev != null ? price - prev : 0,
      change_pct: prev ? ((price - prev) / prev) * 100 : 0,
      currency: m.currency,
      as_of: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null,
      dividend_yield: dividendYield,
      dividend_rate: dividendRate,
      ex_dividend_date: exDivDate,
    };
  } catch {
    return null;
  }
}

export default defineTool({
  name: "watchlist_updates",
  title: "Poll watchlist updates",
  description:
    "Return a polling snapshot for agents: (1) latest quotes for every symbol on the signed-in user's watchlist, (2) dividend fields (yield / rate / ex-date) when available, and (3) alerts (notifications from spread/ROIC/price rules) fired since the `since` cursor. Pass back the returned `cursor` on the next call for incremental delivery. Requires authentication.",
  inputSchema: {
    since: z.string().datetime().optional().describe("ISO timestamp cursor; only alerts created after this are returned. Omit for last 24h."),
    include_dividends: z.boolean().default(true).describe("Include dividend fields per symbol."),
    max_symbols: z.number().int().min(1).max(50).default(25).describe("Cap on symbols to quote."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ since, include_dividends, max_symbols }, ctx: ToolContext) =>
    withInstrumentation("watchlist_updates", ctx, async () => {
      if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
      const sb = sbUser(ctx);
      const uid = ctx.getUserId();

      const { data: items, error: wErr } = await sb
        .from("watchlist_items")
        .select("symbol, name, created_at")
        .eq("user_id", uid)
        .limit(max_symbols);
      if (wErr) return { content: [{ type: "text", text: wErr.message }], isError: true };

      const symbols = (items ?? []).map((i) => (i.symbol as string).toUpperCase());
      const quotes = await Promise.all(
        symbols.map(async (s) => {
          const q = include_dividends
            ? await fetchQuoteSummary(s)
            : await fetchQuoteSummary(s).then((r) => r && ({ ...r, dividend_yield: null, dividend_rate: null, ex_dividend_date: null }));
          return { symbol: s, quote: q };
        }),
      );

      const sinceIso = since ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data: alerts, error: aErr } = await sb
        .from("notifications")
        .select("id, kind, symbol, title, body, payload, severity, created_at")
        .eq("user_id", uid)
        .gt("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(100);
      if (aErr) return { content: [{ type: "text", text: aErr.message }], isError: true };

      const cursor = new Date().toISOString();
      const result = {
        cursor,
        since: sinceIso,
        symbols,
        quotes,
        alerts: alerts ?? [],
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    }, { rateLimit: { max: 60, windowSec: 60 } }),
});