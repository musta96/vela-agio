import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchAllByoNews } from "../_shared/data-provider.ts";
import { isAiOptedOut, aiOptOutResponse } from "../_shared/ai-opt-out.ts";

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

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

// Reputable financial publishers we want represented when available. Most of
// these don't expose direct per-ticker RSS, so we query them through Google
// News (which mirrors their headlines for free, no API key required).
const REPUTABLE_SITES: { source: string; site: string; region?: string }[] = [
  { source: "Bloomberg", site: "bloomberg.com" },
  { source: "Financial Times", site: "ft.com" },
  { source: "Reuters", site: "reuters.com" },
  { source: "Wall Street Journal", site: "wsj.com" },
  { source: "CNBC", site: "cnbc.com" },
  { source: "MarketWatch", site: "marketwatch.com" },
  { source: "Morningstar", site: "morningstar.com" },
  { source: "Barron's", site: "barrons.com" },
  { source: "The Motley Fool", site: "fool.com" },
  { source: "Investor's Business Daily", site: "investors.com" },
  { source: "Value Line", site: "valueline.com" },
  { source: "Zacks", site: "zacks.com" },
  { source: "Sharesight", site: "sharesight.com" },
  { source: "Google Finance", site: "google.com/finance" },
  // Italian / European outlets — useful for FTSE MIB names.
  { source: "Borsa Italiana", site: "borsaitaliana.it", region: "IT" },
  { source: "Il Sole 24 Ore", site: "ilsole24ore.com", region: "IT" },
  { source: "Milano Finanza", site: "milanofinanza.it", region: "IT" },
  { source: "Reuters Italia", site: "it.reuters.com", region: "IT" },
];

// Generic Google News RSS for the ticker — gives us a broad, well-deduped mix
// of mainstream financial coverage when site-scoped queries return nothing.
async function fetchGoogleNewsGeneric(symbol: string, name?: string): Promise<Article[]> {
  const base = symbol.split(".")[0];
  const q = encodeURIComponent(`${base} ${name ?? ""} stock`.trim());
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const r = await fetch(url, { headers: UA });
    if (!r.ok) return [];
    return parseRss(await r.text(), 15).map((a) => ({
      ...a,
      // Google News mangles the source into the title as " - Source"; extract.
      source: extractGoogleNewsSource(a.title) || "Google News",
      title: stripGoogleNewsSuffix(a.title),
    }));
  } catch {
    return [];
  }
}

function extractGoogleNewsSource(title: string): string | null {
  const m = title.match(/\s-\s([^-]+)$/);
  return m ? m[1].trim() : null;
}
function stripGoogleNewsSuffix(title: string): string {
  return title.replace(/\s-\s[^-]+$/, "").trim();
}

// Site-scoped Google News query — surfaces headlines from a specific publisher.
async function fetchPublisher(symbol: string, name: string | undefined, site: string, sourceLabel: string): Promise<Article[]> {
  const base = symbol.split(".")[0];
  const q = encodeURIComponent(`${base} ${name ?? ""} site:${site}`.trim());
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const r = await fetch(url, { headers: UA });
    if (!r.ok) return [];
    return parseRss(await r.text(), 4).map((a) => ({
      ...a,
      source: sourceLabel,
      title: stripGoogleNewsSuffix(a.title),
    }));
  } catch {
    return [];
  }
}

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
  const publishers = REPUTABLE_SITES.map((p) => fetchPublisher(symbol, name, p.site, p.source));
  const [yahoo, sa, reddit, twitter, gnews, ...pubLists] = await Promise.all([
    fetchYahoo(symbol),
    fetchSeekingAlpha(symbol),
    fetchReddit(symbol, name),
    fetchTwitter(symbol),
    fetchGoogleNewsGeneric(symbol, name),
    ...publishers,
  ]);
  // Interleave so AI sees a balanced mix even if we truncate
  const merged: Article[] = [];
  const lists = [yahoo, sa, ...pubLists, gnews, reddit, twitter];
  const max = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) {
    for (const l of lists) if (l[i]) merged.push(l[i]);
  }
  return dedupe(merged, 60);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Lazy import to keep top of file clean
    const { resolveAiAccess, aiDeniedResponse, logAiUsage, modelForCap } = await import("../_shared/ai-access.ts");
    const auth = req.headers.get("Authorization");
    const access = await resolveAiAccess(auth);
    if (!access.allowed) return aiDeniedResponse(access, corsHeaders);

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

    // Free + public sources
    const freeArticles = await fetchHeadlines(symbol, name);
    // Phase 2: BYO premium news (NewsAPI / Marketaux / Finnhub / Benzinga)
    let byo: Article[] = [];
    try {
      const byoRaw = await fetchAllByoNews(req.headers.get("Authorization"), symbol, name);
      byo = byoRaw.map(a => ({ title: a.title, link: a.link, source: a.source, pubDate: a.pubDate, description: a.description }));
    } catch (e) { console.warn("BYO news fetch failed", e); }
    const articles = dedupe([...byo, ...freeArticles], 70);
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
        model: modelForCap(access.modelCap, "google/gemini-3-flash-preview"),
        messages: [
          {
            role: "system",
            content:
              "You are a buy-side financial sentiment analyst. Be objective and concise. You receive headlines from many reputable publishers (Bloomberg, FT, Reuters, WSJ, Morningstar, Barron's, Value Line, CNBC, MarketWatch, Borsa Italiana, Il Sole 24 Ore, etc.) plus social chatter (Reddit, X). Weight institutional / analyst-driven publishers more heavily for fundamentals, but explicitly call out when retail sentiment diverges, and synthesize the distinct analyst camps (bulls, bears, neutrals) with the arguments they each make.",
          },
          {
            role: "user",
            content: `Analyze market sentiment for ${name || symbol} (${symbol}) based on these recent items from mixed reputable sources:\n\n${newsText}\n\nReturn:\n- An overall sentiment score 0-100 (0 = very bearish, 50 = neutral, 100 = very bullish).\n- A label.\n- A 2-sentence summary that explicitly notes whether news and social sentiment agree or diverge.\n- Key drivers.\n- A per-item sentiment (positive/neutral/negative) with a 0-100 score.\n- A synthesis of the distinct analyst opinions / camps (typically 2-4 camps such as "Bull case", "Bear case", "Neutral/Hold"). For each camp give a stance label, a 1-sentence thesis, the main arguments (bullet list), and which source titles support that camp (by their index numbers).`,
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
                analystOpinions: {
                  type: "array",
                  description: "Distinct analyst viewpoints synthesized from the headlines",
                  items: {
                    type: "object",
                    properties: {
                      stance: { type: "string", description: "e.g. Bull case, Bear case, Hold/Neutral" },
                      thesis: { type: "string", description: "1-sentence summary of the view" },
                      arguments: { type: "array", items: { type: "string" } },
                      sourceIndexes: { type: "array", items: { type: "number" }, description: "Indexes of supporting source items" },
                    },
                    required: ["stance", "thesis", "arguments"],
                  },
                },
              },
              required: ["score", "label", "summary", "drivers", "articles", "analystOpinions"],
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

    // === Wave 4: per-source tiering & weighted score ===
    // Tier 1 = institutional / analyst-driven publishers (weight 3)
    // Tier 2 = mainstream financial press (weight 2)
    // Tier 3 = retail / social chatter (weight 1)
    const TIER1 = new Set([
      "Bloomberg", "Financial Times", "Reuters", "Reuters Italia",
      "Wall Street Journal", "Morningstar", "Barron's", "Value Line",
      "Il Sole 24 Ore", "Borsa Italiana",
    ]);
    const TIER3_PREFIX = ["Reddit", "X /", "Twitter"];
    const tierOf = (src: string): 1 | 2 | 3 => {
      if (TIER1.has(src)) return 1;
      if (TIER3_PREFIX.some((p) => src.startsWith(p))) return 3;
      return 2;
    };
    const weightOf = (t: number) => (t === 1 ? 3 : t === 2 ? 2 : 1);

    let wSum = 0, wCount = 0;
    const tierAgg: Record<1 | 2 | 3, { total: number; count: number }> = {
      1: { total: 0, count: 0 }, 2: { total: 0, count: 0 }, 3: { total: 0, count: 0 },
    };
    enrichedArticles.forEach((a: any) => {
      const t = tierOf(a.source);
      const w = weightOf(t);
      wSum += a.score * w;
      wCount += w;
      tierAgg[t].total += a.score;
      tierAgg[t].count += 1;
    });
    const weightedScore = wCount ? Math.round(wSum / wCount) : (typeof parsed.score === "number" ? parsed.score : 50);
    const tierBreakdown = {
      tier1: tierAgg[1].count ? Math.round(tierAgg[1].total / tierAgg[1].count) : null,
      tier2: tierAgg[2].count ? Math.round(tierAgg[2].total / tierAgg[2].count) : null,
      tier3: tierAgg[3].count ? Math.round(tierAgg[3].total / tierAgg[3].count) : null,
      tier1Count: tierAgg[1].count,
      tier2Count: tierAgg[2].count,
      tier3Count: tierAgg[3].count,
    };
    // Retail vs institutional divergence: tier3 (retail) − tier1 (institutional)
    const divergence =
      tierBreakdown.tier1 !== null && tierBreakdown.tier3 !== null
        ? (tierBreakdown.tier3 as number) - (tierBreakdown.tier1 as number)
        : null;

    // === Persist snapshot & compute momentum from history ===
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    let momentum: { d7: number | null; d30: number | null; trend: string; history: { t: string; score: number }[] } = {
      d7: null, d30: null, trend: "flat", history: [],
    };
    if (SUPABASE_URL && SERVICE_KEY) {
      const sb = createClient(SUPABASE_URL, SERVICE_KEY);
      try {
        await sb.from("sentiment_history").insert({
          symbol,
          score: typeof parsed.score === "number" ? parsed.score : 50,
          weighted_score: weightedScore,
          tier1_score: tierBreakdown.tier1,
          tier2_score: tierBreakdown.tier2,
          article_count: enrichedArticles.length,
          label: parsed.label || "neutral",
        });
      } catch (e) { console.error("sentiment_history insert failed", e); }

      try {
        const { data: hist } = await sb
          .from("sentiment_history")
          .select("created_at,weighted_score,score")
          .eq("symbol", symbol)
          .gte("created_at", new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString())
          .order("created_at", { ascending: true });
        const history = (hist || []).map((r: any) => ({
          t: r.created_at,
          score: Number(r.weighted_score ?? r.score),
        }));
        const now = Date.now();
        const findNear = (daysAgo: number) => {
          const target = now - daysAgo * 24 * 3600 * 1000;
          let best: any = null, bestDiff = Infinity;
          for (const h of history) {
            const diff = Math.abs(new Date(h.t).getTime() - target);
            if (diff < bestDiff) { bestDiff = diff; best = h; }
          }
          // require sample within ±(daysAgo/2 + 2) days for relevance
          return best && bestDiff <= (daysAgo / 2 + 2) * 24 * 3600 * 1000 ? best.score : null;
        };
        const past7 = findNear(7);
        const past30 = findNear(30);
        const d7 = past7 !== null ? weightedScore - past7 : null;
        const d30 = past30 !== null ? weightedScore - past30 : null;
        const trend = d7 === null ? "insufficient_history" : d7 >= 5 ? "improving" : d7 <= -5 ? "deteriorating" : "stable";
        momentum = { d7, d30, trend, history };
      } catch (e) { console.error("sentiment_history read failed", e); }
    }

    return new Response(JSON.stringify({
      symbol,
      score: typeof parsed.score === "number" ? parsed.score : 50,
      weightedScore,
      tierBreakdown,
      divergence,
      momentum,
      label: parsed.label || "neutral",
      summary: parsed.summary || "",
      drivers: parsed.drivers || [],
      articles: enrichedArticles,
      sources,
      analystOpinions: parsed.analystOpinions || [],
      generatedAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("analyze-sentiment error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});