import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Article {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description?: string;
}

function parseRss(xml: string, max = 12): Article[] {
  const items: Article[] = [];
  const itemRe = /<item[\s\S]*?<\/item>/g;
  const matches = xml.match(itemRe) || [];
  for (const it of matches.slice(0, max)) {
    const pick = (tag: string) => {
      const m = it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      if (!m) return "";
      let v = m[1].trim();
      v = v.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
      return v.trim();
    };
    const title = pick("title");
    const link = pick("link");
    const pubDate = pick("pubDate");
    const description = pick("description").replace(/<[^>]+>/g, "").slice(0, 400);
    let source = "Yahoo Finance";
    const srcM = it.match(/<source[^>]*>([\s\S]*?)<\/source>/);
    if (srcM) source = srcM[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim() || source;
    if (title) items.push({ title, link, pubDate, source, description });
  }
  return items;
}

const UA = { "User-Agent": "Mozilla/5.0 (compatible; LovableSentimentBot/1.0)" };

// Yahoo Finance RSS (mainstream financial news)
async function fetchYahoo(symbol: string): Promise<Article[]> {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
  try {
    const r = await fetch(url, { headers: UA });
    if (!r.ok) return [];
    return parseRss(await r.text()).map((a) => ({ ...a, source: a.source || "Yahoo Finance" }));
  } catch {
    return [];
  }
}

// Seeking Alpha public RSS for a given ticker
async function fetchSeekingAlpha(symbol: string): Promise<Article[]> {
  // Seeking Alpha symbol feeds use the base ticker (strip exchange suffix like .MI)
  const base = symbol.split(".")[0];
  const url = `https://seekingalpha.com/api/sa/combined/${encodeURIComponent(base)}.xml`;
  try {
    const r = await fetch(url, { headers: UA });
    if (!r.ok) return [];
    return parseRss(await r.text(), 8).map((a) => ({ ...a, source: "Seeking Alpha" }));
  } catch {
    return [];
  }
}

// Reddit: search retail-investor subs for the ticker. Public JSON, no auth.
async function fetchReddit(symbol: string, name?: string): Promise<Article[]> {
  const subs = [
    "wallstreetbets",
    "stocks",
    "investing",
    "StockMarket",
    "SecurityAnalysis",
    "ValueInvesting",
    "ItaliaInvestimenti",
    "eupersonalfinance",
  ];
  const base = symbol.split(".")[0];
  const queries = [base, name].filter(Boolean) as string[];
  const out: Article[] = [];
  await Promise.all(
    subs.map(async (sub) => {
      for (const q of queries) {
        const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(q)}&sort=new&restrict_sr=1&limit=6&t=month`;
        try {
          const r = await fetch(url, { headers: UA });
          if (!r.ok) continue;
          const json = await r.json();
          const posts = json?.data?.children || [];
          for (const p of posts) {
            const d = p?.data;
            if (!d?.title) continue;
            out.push({
              title: d.title,
              link: `https://www.reddit.com${d.permalink}`,
              pubDate: new Date((d.created_utc || 0) * 1000).toUTCString(),
              source: `Reddit r/${sub}`,
              description: (d.selftext || "").replace(/\s+/g, " ").slice(0, 400),
            });
          }
          break; // one query per sub is enough
        } catch {
          /* ignore sub failure */
        }
      }
    })
  );
  return out;
}

// X / Twitter via public Nitter RSS mirrors (best-effort — instances rotate)
async function fetchTwitter(symbol: string): Promise<Article[]> {
  const base = symbol.split(".")[0];
  const query = encodeURIComponent(`$${base} OR ${base} stock`);
  const instances = [
    "https://nitter.net",
    "https://nitter.privacydev.net",
    "https://nitter.poast.org",
  ];
  for (const inst of instances) {
    try {
      const r = await fetch(`${inst}/search/rss?f=tweets&q=${query}`, { headers: UA });
      if (!r.ok) continue;
      const items = parseRss(await r.text(), 10).map((a) => ({ ...a, source: "X / Twitter" }));
      if (items.length) return items;
    } catch {
      /* try next instance */
    }
  }
  return [];
}

function dedupe(items: Article[], limit = 40): Article[] {
  const seen = new Set<string>();
  const out: Article[] = [];
  for (const a of items) {
    const key = a.title.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchHeadlines(symbol: string, name?: string): Promise<Article[]> {
  const [yahoo, sa, reddit, twitter] = await Promise.all([
    fetchYahoo(symbol),
    fetchSeekingAlpha(symbol),
    fetchReddit(symbol, name),
    fetchTwitter(symbol),
  ]);
  // Interleave so AI sees a balanced mix even if we truncate
  const merged: Article[] = [];
  const lists = [yahoo, sa, reddit, twitter];
  const max = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) {
    for (const l of lists) if (l[i]) merged.push(l[i]);
  }
  return dedupe(merged, 40);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { symbol, name } = await req.json();
    if (!symbol || typeof symbol !== "string") {
      return new Response(JSON.stringify({ error: "symbol required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const articles = await fetchHeadlines(symbol, name);
    if (articles.length === 0) {
      return new Response(JSON.stringify({
        symbol, score: 50, label: "neutral",
        summary: "No recent news, Reddit threads, Seeking Alpha posts, or social chatter were found for this ticker.",
        drivers: [], articles: [], sources: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const newsText = articles
      .map(
        (a, i) =>
          `${i + 1}. [${a.source}] ${a.title}${a.description ? " — " + a.description : ""}`
      )
      .join("\n");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are a financial sentiment analyst. Be objective and concise. Distinguish between mainstream news (Yahoo Finance, Seeking Alpha) and retail/social chatter (Reddit, X/Twitter): weight mainstream sources more heavily for fundamentals but note when retail sentiment diverges sharply.",
          },
          {
            role: "user",
            content: `Analyze market sentiment for ${name || symbol} (${symbol}) based on these recent items from mixed sources (news + Reddit + Seeking Alpha + X):\n\n${newsText}\n\nProvide an overall sentiment score 0-100 (0 = very bearish, 50 = neutral, 100 = very bullish), a label, a 2-sentence summary that explicitly mentions whether news and social sentiment agree or diverge, key drivers, and a per-item sentiment (positive/neutral/negative) with a 0-100 score.`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "report_sentiment",
            description: "Return structured sentiment analysis",
            parameters: {
              type: "object",
              properties: {
                score: { type: "number", description: "0-100 overall sentiment" },
                label: { type: "string", enum: ["very bearish", "bearish", "neutral", "bullish", "very bullish"] },
                summary: { type: "string" },
                drivers: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      impact: { type: "string", enum: ["positive", "negative", "neutral"] },
                    },
                    required: ["title", "impact"],
                  },
                },
                articles: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      index: { type: "number" },
                      sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
                      score: { type: "number" },
                    },
                    required: ["index", "sentiment", "score"],
                  },
                },
              },
              required: ["score", "label", "summary", "drivers", "articles"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report_sentiment" } },
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded, try again in a moment." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits depleted. Add credits in Settings > Workspace > Usage." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI error", aiRes.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const call = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: any = {};
    try { parsed = JSON.parse(call?.function?.arguments || "{}"); } catch {}

    const enrichedArticles = articles.map((a, i) => {
      const ai = (parsed.articles || []).find((x: any) => x.index === i + 1);
      return { ...a, sentiment: ai?.sentiment || "neutral", score: typeof ai?.score === "number" ? ai.score : 50 };
    });

    // Per-source breakdown (average score) so UI can show which channels are bullish/bearish
    const bySource = new Map<string, { total: number; count: number }>();
    enrichedArticles.forEach((a: any) => {
      const cur = bySource.get(a.source) || { total: 0, count: 0 };
      cur.total += a.score;
      cur.count += 1;
      bySource.set(a.source, cur);
    });
    const sources = Array.from(bySource.entries()).map(([source, v]) => ({
      source,
      avgScore: Math.round(v.total / v.count),
      count: v.count,
    }));

    return new Response(JSON.stringify({
      symbol,
      score: typeof parsed.score === "number" ? parsed.score : 50,
      label: parsed.label || "neutral",
      summary: parsed.summary || "",
      drivers: parsed.drivers || [],
      articles: enrichedArticles,
      sources,
      generatedAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("analyze-sentiment error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});