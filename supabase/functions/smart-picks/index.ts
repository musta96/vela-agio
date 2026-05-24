const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Bar { t: number; close: number; }

async function fetchBars(symbol: string): Promise<Bar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    const j = await res.json();
    const r = j?.chart?.result?.[0];
    if (!r) return [];
    const ts: number[] = r.timestamp || [];
    const cl: (number | null)[] = r.indicators?.quote?.[0]?.close || [];
    const bars: Bar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = cl[i];
      if (typeof c === "number" && !isNaN(c)) bars.push({ t: ts[i] * 1000, close: c });
    }
    return bars;
  } catch { return []; }
}

async function fetchFundamentals(symbol: string): Promise<{ sector?: string; dividendYield?: number }> {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile,summaryDetail`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return {};
    const j = await res.json();
    const r = j?.quoteSummary?.result?.[0];
    const sector: string | undefined = r?.assetProfile?.sector;
    const dyRaw = r?.summaryDetail?.dividendYield;
    const dy = typeof dyRaw === "number" ? dyRaw : (typeof dyRaw?.raw === "number" ? dyRaw.raw : undefined);
    return { sector, dividendYield: typeof dy === "number" ? Number((dy * 100).toFixed(2)) : undefined };
  } catch { return {}; }
}

function computeMetrics(bars: Bar[]) {
  const closes = bars.map(b => b.close);
  const n = closes.length;
  if (n < 60) return null;
  const last = closes[n - 1];
  const ret = (days: number) => {
    const i = Math.max(0, n - 1 - days);
    return ((last - closes[i]) / closes[i]) * 100;
  };
  const sma = (period: number) => {
    if (n < period) return null;
    let s = 0; for (let i = n - period; i < n; i++) s += closes[i];
    return s / period;
  };
  const sma20 = sma(20)!, sma50 = sma(50)!;
  // RSI 14
  let gains = 0, losses = 0;
  for (let i = n - 14; i < n; i++) {
    const d = closes[i] - closes[i-1];
    if (d >= 0) gains += d; else losses -= d;
  }
  const avgG = gains / 14, avgL = losses / 14;
  const rsi = avgL === 0 ? 100 : 100 - 100/(1 + avgG/avgL);
  // Volatility (annualized stdev of daily returns)
  const rets: number[] = [];
  for (let i = 1; i < n; i++) rets.push((closes[i]-closes[i-1])/closes[i-1]);
  const mean = rets.reduce((a,b)=>a+b,0)/rets.length;
  const variance = rets.reduce((a,b)=>a+(b-mean)**2,0)/rets.length;
  const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;
  // Max drawdown over the available window (typically ~1Y)
  let peak = closes[0]; let maxDd = 0;
  for (let i = 0; i < n; i++) {
    if (closes[i] > peak) peak = closes[i];
    const dd = (closes[i] - peak) / peak;
    if (dd < maxDd) maxDd = dd;
  }

  return {
    price: Number(last.toFixed(2)),
    ret1M: Number(ret(21).toFixed(2)),
    ret3M: Number(ret(63).toFixed(2)),
    ret6M: Number(ret(126).toFixed(2)),
    ret1Y: Number(ret(252).toFixed(2)),
    sma20: Number(sma20.toFixed(2)),
    sma50: Number(sma50.toFixed(2)),
    trendUp: sma20 > sma50,
    rsi: Number(rsi.toFixed(1)),
    volatility: Number(volatility.toFixed(1)),
    maxDrawdown: Number((maxDd * 100).toFixed(1)),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const candidates: { symbol: string; name: string; market: string }[] = body.candidates || [];
    const riskProfile: string = body.riskProfile || "balanced";
    const horizon: string = body.horizon || "medium";
    const topN: number = Math.min(Number(body.topN) || 6, 10);
    const filters = body.filters || {};
    const sectorFilter: string = (filters.sector || "All");
    const minDividendYield: number | null = filters.minDividendYield != null ? Number(filters.minDividendYield) : null;
    const maxVolatility: number | null = filters.maxVolatility != null ? Number(filters.maxVolatility) : null;
    const maxDrawdown: number | null = filters.maxDrawdown != null ? Number(filters.maxDrawdown) : null; // positive number meaning allowed magnitude, e.g. 30 means drawdown >= -30%

    if (candidates.length === 0) {
      return new Response(JSON.stringify({ error: "candidates required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch metrics + fundamentals for all candidates in parallel (cap at 25)
    const subset = candidates.slice(0, 25);
    const enriched = await Promise.all(subset.map(async c => {
      const [bars, fund] = await Promise.all([fetchBars(c.symbol), fetchFundamentals(c.symbol)]);
      const m = computeMetrics(bars);
      return m ? { ...c, ...m, sector: fund.sector, dividendYield: fund.dividendYield } : null;
    }));
    let valid = enriched.filter((x): x is NonNullable<typeof x> => x !== null);

    // Apply advanced filters
    const filtersApplied: string[] = [];
    if (sectorFilter && sectorFilter !== "All") {
      valid = valid.filter(v => (v.sector || "").toLowerCase() === sectorFilter.toLowerCase());
      filtersApplied.push(`sector=${sectorFilter}`);
    }
    if (minDividendYield != null && !isNaN(minDividendYield)) {
      valid = valid.filter(v => (v.dividendYield ?? 0) >= minDividendYield);
      filtersApplied.push(`dividendYield>=${minDividendYield}%`);
    }
    if (maxVolatility != null && !isNaN(maxVolatility)) {
      valid = valid.filter(v => v.volatility <= maxVolatility);
      filtersApplied.push(`volatility<=${maxVolatility}%`);
    }
    if (maxDrawdown != null && !isNaN(maxDrawdown)) {
      valid = valid.filter(v => v.maxDrawdown >= -Math.abs(maxDrawdown));
      filtersApplied.push(`drawdown>=-${Math.abs(maxDrawdown)}%`);
    }

    if (valid.length === 0) {
      return new Response(JSON.stringify({ error: filtersApplied.length ? `No candidates match the selected filters (${filtersApplied.join(", ")}). Try relaxing them.` : "No valid market data fetched" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const candidatesText = valid.map(v =>
      `${v.symbol} (${v.name}, ${v.market}${v.sector ? `, ${v.sector}` : ""}): price=${v.price}, 1M=${v.ret1M}%, 3M=${v.ret3M}%, 6M=${v.ret6M}%, 1Y=${v.ret1Y}%, RSI=${v.rsi}, trend=${v.trendUp ? "up" : "down"} (SMA20 ${v.sma20} vs SMA50 ${v.sma50}), vol=${v.volatility}%, maxDD=${v.maxDrawdown}%${v.dividendYield != null ? `, divYield=${v.dividendYield}%` : ""}`
    ).join("\n");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a quantitative equity analyst combining technical signals, momentum, trend, and risk to identify the most promising opportunities. Be objective. This is for educational purposes, not financial advice." },
          { role: "user", content: `Rank the top ${topN} most promising opportunities for a ${riskProfile} investor with a ${horizon}-term horizon. For each pick provide: confidence 0-100, concise bull thesis (3 bullets), key risks (2 bullets), and a 1-sentence rationale citing the metrics.\n\nCandidates with technical metrics:\n${candidatesText}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "report_picks",
            description: "Return ranked stock picks",
            parameters: {
              type: "object",
              properties: {
                picks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      symbol: { type: "string" },
                      confidence: { type: "number" },
                      rationale: { type: "string" },
                      bullThesis: { type: "array", items: { type: "string" } },
                      risks: { type: "array", items: { type: "string" } },
                    },
                    required: ["symbol", "confidence", "rationale", "bullThesis", "risks"],
                  },
                },
                marketCommentary: { type: "string" },
              },
              required: ["picks", "marketCommentary"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report_picks" } },
      }),
    });

    if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI credits depleted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI error", aiRes.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiJson = await aiRes.json();
    const call = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: any = {};
    try { parsed = JSON.parse(call?.function?.arguments || "{}"); } catch {}

    const picks = (parsed.picks || []).map((p: any) => {
      const meta = valid.find(v => v.symbol === p.symbol);
      return { ...p, ...(meta || {}) };
    });

    return new Response(JSON.stringify({
      picks,
      marketCommentary: parsed.marketCommentary || "",
      generatedAt: new Date().toISOString(),
      analyzed: valid.length,
      filtersApplied,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("smart-picks error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});