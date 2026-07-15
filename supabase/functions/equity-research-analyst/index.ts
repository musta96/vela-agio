import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { resolveAIConfig } from '../_shared/ai-provider.ts';
import { resolveAiAccess, aiDeniedResponse } from '../_shared/ai-access.ts';

// AI Equity Research Analyst.
// Reads a filing (10-K, 10-Q, 8-K, 20-F) or an earnings call transcript
// and returns a structured research note with key metrics, risks,
// management tone/sentiment, opportunities, and a portfolio-manager
// style recommendation.

const UA = 'Vela AI Equity Research research@vela.ai';

interface Body {
  symbol: string;
  name?: string;
  mode: 'filing' | 'transcript';
  filingUrl?: string;
  transcript?: string;
  lang?: string;
  focus?: string; // optional user emphasis: "margins", "guidance", "risks"...
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchFilingText(url: string): Promise<{ text: string; note?: string }> {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' } });
  if (!r.ok) throw new Error(`Filing fetch failed: ${r.status}`);
  const raw = await r.text();
  const text = htmlToText(raw);
  // cap tokens sent to LLM. ~150k chars ≈ ~40k tokens.
  const CAP = 150_000;
  if (text.length > CAP) {
    return { text: text.slice(0, CAP), note: `Filing truncated to first ${CAP.toLocaleString()} characters for AI analysis.` };
  }
  return { text };
}

const SCHEMA = `{
  "reportType": "10-K"|"10-Q"|"8-K"|"20-F"|"Earnings Call"|"Other",
  "period": string,
  "executiveSummary": string,
  "businessOverview": string,
  "keyMetrics": [{"label": string, "value": string, "yoyChange": string, "commentary": string}],
  "guidance": {"stated": boolean, "summary": string, "direction": "raised"|"reiterated"|"lowered"|"none"},
  "risks": [{"category": "market"|"operational"|"regulatory"|"financial"|"strategic"|"macro"|"legal", "title": string, "detail": string, "severity": "high"|"medium"|"low"}],
  "opportunities": [{"title": string, "detail": string, "horizon": "short"|"medium"|"long"}],
  "managementTone": {"sentiment": "positive"|"cautiously-positive"|"neutral"|"cautious"|"negative", "confidence": "high"|"medium"|"low", "notableQuotes": [string], "commentary": string},
  "capitalAllocation": string,
  "researchNote": string,
  "recommendation": {"stance": "constructive"|"neutral"|"cautious", "timeframe": "short"|"medium"|"long", "rationale": string},
  "redFlags": [string],
  "followUpQuestions": [string]
}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const access = await resolveAiAccess(req.headers.get('Authorization'));
  if (!access.allowed) return aiDeniedResponse(access, corsHeaders);

  try {
    const body = (await req.json()) as Body;
    if (!body?.symbol || !body?.mode) {
      return new Response(JSON.stringify({ error: 'symbol and mode required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (body.mode === 'filing' && !body.filingUrl) {
      return new Response(JSON.stringify({ error: 'filingUrl required for mode=filing' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (body.mode === 'transcript' && !body.transcript?.trim()) {
      return new Response(JSON.stringify({ error: 'transcript required for mode=transcript' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sym = body.symbol.toUpperCase();
    const name = body.name || sym;
    const lang = body.lang || 'en';
    const langName = lang === 'it' ? 'Italian' : 'English';

    let source = '';
    let note: string | undefined;

    if (body.mode === 'filing') {
      const { text, note: n } = await fetchFilingText(body.filingUrl!);
      source = text; note = n;
    } else {
      source = body.transcript!.slice(0, 150_000);
      if (body.transcript!.length > 150_000) note = 'Transcript truncated to 150,000 characters for AI analysis.';
    }

    if (source.length < 400) {
      return new Response(JSON.stringify({ error: 'source_too_short', note: 'The document text was too short to analyze. Try a different filing URL or paste the full transcript.' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cfg = await resolveAIConfig(req.headers.get('Authorization'));
    const focusLine = body.focus ? `The analyst has asked to focus on: ${body.focus}. Weight the note accordingly, but still cover every section.` : '';
    const modeLabel = body.mode === 'filing' ? 'SEC filing / annual or interim report' : 'earnings call transcript';

    const systemPrompt = `You are a senior sell-side equity research analyst at a top-tier investment bank covering ${name} (${sym}).
You read ${modeLabel} documents and extract signal for portfolio managers.
Write ALL prose fields in ${langName}. Be number-driven, specific, and balanced — separate what management SAID from what the numbers SHOW.
Never fabricate figures: only quote numbers that appear in the source document. If a metric is not disclosed, say "not disclosed".
Return STRICT JSON only, matching this schema exactly (do not add extra keys): ${SCHEMA}`;

    const userPrompt = `Ticker: ${sym}
Company: ${name}
Document type: ${modeLabel}
${focusLine}

SOURCE DOCUMENT (verbatim, may be truncated):
"""
${source}
"""

Produce the JSON research note now.`;

    const r = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST',
      headers: cfg.headers,
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (r.status === 429) {
      return new Response(JSON.stringify({ error: 'rate_limited', message: 'AI is temporarily rate-limited. Please retry shortly.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (r.status === 402) {
      return new Response(JSON.stringify({ error: 'credits_exhausted', message: 'AI credits exhausted for this workspace.' }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`AI ${r.status}: ${t.slice(0, 400)}`);
    }
    const j = await r.json();
    let parsed: any = {};
    try { parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? '{}'); } catch { parsed = {}; }

    return new Response(JSON.stringify({
      symbol: sym,
      name,
      mode: body.mode,
      generatedAt: new Date().toISOString(),
      model: cfg.model,
      providerNotice: cfg.notice,
      sourceNote: note,
      report: parsed,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('equity-research-analyst error', e);
    return new Response(JSON.stringify({ error: 'internal', message: String((e as Error)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});