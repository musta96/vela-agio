import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

// Public Yahoo chart endpoint — no auth needed. Same pattern as market-movers.
async function fetchQuote(symbol: string) {
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36";
  const direct = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2d&interval=1d`;
  for (const url of [direct, `https://api.allorigins.win/raw?url=${encodeURIComponent(direct)}`]) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (!r.ok) continue;
      const j = await r.json();
      const m = j?.chart?.result?.[0]?.meta;
      if (!m) continue;
      const price = m.regularMarketPrice ?? m.previousClose;
      const prev = m.previousClose ?? m.chartPreviousClose;
      if (price == null) continue;
      const change = prev != null ? price - prev : 0;
      return {
        symbol: m.symbol ?? symbol,
        name: m.shortName ?? m.longName ?? symbol,
        price,
        change,
        change_pct: prev ? (change / prev) * 100 : 0,
        currency: m.currency,
        exchange: m.fullExchangeName ?? m.exchangeName,
        as_of: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null,
      };
    } catch {
      /* try next */
    }
  }
  return null;
}

export default defineTool({
  name: "get_quote",
  title: "Get quote",
  description:
    "Latest price and daily change for a Yahoo-style ticker (e.g. AAPL, ENI.MI, ASML.AS). Public market data — no auth required.",
  inputSchema: {
    symbol: z.string().min(1).describe("Yahoo-style ticker symbol, e.g. AAPL, ENI.MI"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ symbol }) => {
    const q = await fetchQuote(symbol.toUpperCase());
    if (!q) {
      return {
        content: [{ type: "text", text: `No quote available for "${symbol}".` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(q) }],
      structuredContent: q,
    };
  },
});