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

async function fetchHeadlines(symbol: string): Promise<Article[]> {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return [];
    return parseRss(await r.text());
  } catch {
    return [];
  }
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

    const articles = await fetchHeadlines(symbol);
    if (articles.length === 0) {
      return new Response(JSON.stringify({
        symbol, score: 50, label: "neutral",
        summary: "No recent news headlines were found for this ticker.",
        drivers: [], articles: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const newsText = articles
      .map((a, i) => `${i + 1}. ${a.title}${a.description ? " — " + a.description : ""}`)
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
          { role: "system", content: "You are a financial sentiment analyst. Be objective and concise." },
          { role: "user", content: `Analyze market sentiment for ${name || symbol} (${symbol}) based on these recent headlines:\n\n${newsText}\n\nProvide an overall sentiment score 0-100 (0 = very bearish, 50 = neutral, 100 = very bullish), a label, a 2-sentence summary, key drivers, and a per-article sentiment (positive/neutral/negative) with a 0-100 score.` },
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

    return new Response(JSON.stringify({
      symbol,
      score: typeof parsed.score === "number" ? parsed.score : 50,
      label: parsed.label || "neutral",
      summary: parsed.summary || "",
      drivers: parsed.drivers || [],
      articles: enrichedArticles,
      generatedAt: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("analyze-sentiment error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});