// startup-sentiment — real, live sentiment for a PRIVATE company / startup.
//
// Private companies have no ticker, so we read what the press actually writes
// about them: Google News RSS (free, no key) for the company name and, when the
// user has their own news keys saved, NewsAPI / Marketaux / Finnhub / Benzinga
// through the shared BYO helpers. Headlines are then scored — with the user's
// AI provider when available, with a transparent keyword model otherwise.
//
// Nothing is invented: when no article is found we say so instead of returning
// a made-up score.

import { fetchAllByoNews } from "../_shared/data-provider.ts";
import { resolveAIConfig } from "../_shared/ai-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

interface Article { title: string; link: string; source: string; pubDate: string; description?: string }

function parseRss(xml: string, max = 20): Article[] {
  const out: Article[] = [];
  for (const it of (xml.match(/<item[\s\S]*?<\/item>/g) ?? []).slice(0, max)) {
    const pick = (tag: string) => {
      const m = it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      if (!m) return "";
      return m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
    };
    const title = pick("title");
    const link = pick("link");
    if (!title || !link) continue;
    out.push({
      title,
      link,
      pubDate: pick("pubDate") || new Date().toISOString(),
      source: pick("source") || "Google News",
      description: pick("description").replace(/<[^>]+>/g, "").slice(0, 300),
    });
  }
  return out;
}

/** GDELT global news index — free, no key, worldwide press including small startups. */
async function gdelt(query: string): Promise<Article[]> {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=25&format=json&sort=datedesc&timespan=6months`;
  try {
    const r = await fetch(url, { headers: UA });
    if (!r.ok) return [];
    const j = await r.json().catch(() => null);
    return (j?.articles ?? []).map((a: Record<string, string>) => {
      const d = String(a.seendate ?? "");
      const iso = d.length >= 15
        ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(9, 11)}:${d.slice(11, 13)}:${d.slice(13, 15)}Z`
        : new Date().toISOString();
      return { title: a.title ?? "", link: a.url ?? "", source: a.domain ?? "News", pubDate: iso, description: "" };
    }).filter((a: Article) => a.title && a.link);
  } catch { return []; }
}

/** Bing News RSS — free, no key, good coverage of press releases and trade titles. */
async function bingNews(query: string): Promise<Article[]> {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=RSS`;
  try {
    const r = await fetch(url, { headers: UA });
    if (!r.ok) return [];
    return parseRss(await r.text());
  } catch { return []; }
}


// --- transparent keyword model (always available, used as the fallback) ---
const POS = ["raises", "raised", "funding", "series a", "series b", "series c", "seed round", "oversubscribed",
  "acquisition", "acquires", "partnership", "launch", "launches", "expansion", "expands", "record", "growth",
  "profitable", "breakeven", "award", "unicorn", "hiring", "milestone", "contract", "approval", "patent"];
const NEG = ["layoff", "layoffs", "shuts", "shutdown", "insolvency", "bankrupt", "bankruptcy", "down round",
  "lawsuit", "sued", "probe", "investigation", "fraud", "resigns", "resignation", "delay", "delays", "recall",
  "breach", "hack", "fine", "fined", "cuts", "struggles", "wind down", "fails", "failure", "loss"];

function keywordScore(a: Article): number {
  const t = `${a.title} ${a.description ?? ""}`.toLowerCase();
  let s = 0;
  for (const w of POS) if (t.includes(w)) s += 1;
  for (const w of NEG) if (t.includes(w)) s -= 1.3;
  return Math.max(-1, Math.min(1, s / 3));
}

const recencyWeight = (iso: string) => {
  const days = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (!Number.isFinite(days) || days < 0) return 1;
  return Math.exp(-days / 45); // ~half weight after six weeks
};

function label(score: number) {
  if (score >= 45) return "very positive";
  if (score >= 15) return "positive";
  if (score > -15) return "neutral";
  if (score > -45) return "negative";
  return "very negative";
}

async function aiScore(articles: Article[], name: string, authHeader: string | null) {
  const cfg = await resolveAIConfig(authHeader);
  const list = articles.slice(0, 18).map((a, i) => `${i + 1}. [${a.source}] ${a.title}`).join("\n");
  const body: Record<string, unknown> = {
    model: cfg.effectiveProvider === "lovable" ? "openai/gpt-6-astra" : cfg.model,
    messages: [
      { role: "system", content: "You judge investor sentiment about a private company from press headlines. Reply with strict JSON only." },
      {
        role: "user",
        content:
          `Company: ${name}\nHeadlines:\n${list}\n\n` +
          `Return JSON: {"score": number -100..100, "summary": string (max 30 words), ` +
          `"drivers": [{"text": string, "direction": "positive"|"negative"|"neutral"}] (max 5), ` +
          `"per_article": [{"index": number, "score": number -1..1}]}. ` +
          `Score only what the headlines support; if they are thin or unrelated, stay close to 0.`,
      },
    ],
  };
  if (cfg.effectiveProvider === "lovable") body.reasoning_effort = "low";

  const r = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cfg.headers },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`ai ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const raw = j?.choices?.[0]?.message?.content ?? "";
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("ai returned no JSON");
  const parsed = JSON.parse(m[0]);
  return { parsed, model: body.model as string, provider: cfg.effectiveProvider, notice: cfg.notice };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const auth = req.headers.get("Authorization");
    const { name, website, sector, country } = await req.json().catch(() => ({}));
    if (!name || String(name).trim().length < 2) return json({ error: "A company name is required." }, 400);
    const company = String(name).trim();
    const domain = website ? String(website).replace(/^https?:\/\//, "").replace(/\/.*$/, "") : "";

    const queries = [
      `"${company}"`,
      sector ? `"${company}" ${sector}` : `"${company}" startup funding`,
      domain ? `"${domain}"` : "",
    ].filter(Boolean);

    const [gdeltBatches, bingBatches, byo] = await Promise.all([
      Promise.all(queries.slice(0, 2).map((q) => gdelt(q))),
      Promise.all(queries.map((q) => bingNews(q))),
      fetchAllByoNews(auth, company, company).catch(() => []),
    ]);

    const seen = new Set<string>();
    const articles: Article[] = [...gdeltBatches.flat(), ...bingBatches.flat(), ...(byo as Article[])]
      .filter((a) => {
        const k = a.title.toLowerCase().slice(0, 90);
        if (seen.has(k)) return false;
        seen.add(k);
        // Keep only pieces that actually mention the company or come from its own domain.
        const hay = `${a.title} ${a.description ?? ""}`.toLowerCase();
        const first = company.toLowerCase().split(/\s+/)[0];
        return hay.includes(company.toLowerCase())
          || (first.length >= 4 && hay.includes(first))
          || (!!domain && (hay.includes(domain.toLowerCase()) || a.link.toLowerCase().includes(domain.toLowerCase())));
      })
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
      .slice(0, 24);

    if (articles.length === 0) {
      return json({
        company, country: country ?? null, score: null, label: "no coverage",
        summary: `No press coverage found for ${company} in the free and connected news sources. Add the company website, or connect a news API key in Settings → Connections, for wider reach.`,
        drivers: [], articles: [], sources: ["GDELT", "Bing News"], articleCount: 0,
        method: "none", asOf: new Date().toISOString(),
      });
    }
        method: "none", asOf: new Date().toISOString(),
      });
    }

    let score: number;
    let summary = "";
    let drivers: Array<{ text: string; direction: string }> = [];
    let method = "keyword";
    let model: string | null = null;
    let degradedReason: string | null = null;
    const perArticle = new Map<number, number>();

    try {
      const { parsed, model: usedModel } = await aiScore(articles, company, auth);
      score = Math.max(-100, Math.min(100, Number(parsed.score) || 0));
      summary = String(parsed.summary ?? "").slice(0, 300);
      drivers = Array.isArray(parsed.drivers) ? parsed.drivers.slice(0, 5) : [];
      for (const p of parsed.per_article ?? []) {
        const i = Number(p.index) - 1;
        if (Number.isFinite(i)) perArticle.set(i, Math.max(-1, Math.min(1, Number(p.score) || 0)));
      }
      method = "ai";
      model = usedModel;
    } catch (e) {
      degradedReason = e instanceof Error ? e.message : "AI scoring unavailable";
      let wsum = 0, w = 0;
      articles.forEach((a, i) => {
        const s = keywordScore(a);
        perArticle.set(i, s);
        const weight = recencyWeight(a.pubDate);
        wsum += s * weight; w += weight;
      });
      score = w > 0 ? Math.round((wsum / w) * 100) : 0;
      const top = articles
        .map((a, i) => ({ a, s: perArticle.get(i) ?? 0 }))
        .filter((x) => Math.abs(x.s) > 0.2)
        .sort((x, y) => Math.abs(y.s) - Math.abs(x.s))
        .slice(0, 4);
      drivers = top.map((x) => ({ text: x.a.title, direction: x.s > 0 ? "positive" : "negative" }));
      summary = `Scored from ${articles.length} recent headlines with the keyword model (AI scoring unavailable).`;
    }

    return json({
      company,
      country: country ?? null,
      score: Math.round(score),
      label: label(score),
      summary,
      drivers,
      method,
      model,
      degradedReason,
      articleCount: articles.length,
      sources: [...new Set(articles.map((a) => a.source))].slice(0, 12),
      articles: articles.slice(0, 12).map((a, i) => ({
        title: a.title, link: a.link, source: a.source, pubDate: a.pubDate, score: perArticle.get(i) ?? null,
      })),
      asOf: new Date().toISOString(),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "startup sentiment failed" }, 500);
  }
});
