import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveAIConfig } from '../_shared/ai-provider.ts';
import { resolveAiAccess, aiDeniedResponse } from '../_shared/ai-access.ts';

// AI Equity Research Analyst.
// Reads a filing (10-K, 10-Q, 8-K, 20-F) or an earnings call transcript
// and returns a structured research note with key metrics, risks,
// management tone/sentiment, opportunities, and a portfolio-manager
// style recommendation.

const UA = 'Vela AI Equity Research research@vela.ai';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const HOURLY_LIMIT = 30;                    // fresh AI runs per user per hour
const CACHE_TTL_FILING_MS = 7 * 24 * 3600 * 1000;
const CACHE_TTL_TRANSCRIPT_MS = 24 * 3600 * 1000;

interface Body {
  action?: 'analyze' | 'list' | 'get' | 'delete' | 'share_create' | 'share_revoke' | 'share_get';
  symbol: string;
  name?: string;
  mode?: 'filing' | 'transcript';
  filingUrl?: string;
  filingLabel?: string;
  transcript?: string;
  lang?: string;
  focus?: string;
  force?: boolean;   // bypass cache
  id?: string;      // for get/delete
  ids?: string[];   // for multi-get (compare)
  // share
  token?: string;
  permissions?: {
    showCitations?: boolean;
    showRecommendation?: boolean;
    showRedFlags?: boolean;
    showFollowUps?: boolean;
    showResearchNote?: boolean;
  };
  expiresInDays?: number | null;
  tags?: string[];
}

/** Normalize user tags: trimmed, lowercase, deduped, <=24 chars, max 12 per note. */
function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    const v = String(t ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 24);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= 12) break;
  }
  return out;
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
  "keyMetrics": [{"label": string, "value": string, "yoyChange": string, "commentary": string, "citation": {"quote": string, "section": string}}],
  "guidance": {"stated": boolean, "summary": string, "direction": "raised"|"reiterated"|"lowered"|"none"},
  "risks": [{"category": "market"|"operational"|"regulatory"|"financial"|"strategic"|"macro"|"legal", "title": string, "detail": string, "severity": "high"|"medium"|"low", "citation": {"quote": string, "section": string}}],
  "opportunities": [{"title": string, "detail": string, "horizon": "short"|"medium"|"long"}],
  "managementTone": {"sentiment": "positive"|"cautiously-positive"|"neutral"|"cautious"|"negative", "confidence": "high"|"medium"|"low", "notableQuotes": [{"quote": string, "section": string}], "commentary": string},
  "capitalAllocation": string,
  "researchNote": string,
  "recommendation": {"stance": "constructive"|"neutral"|"cautious", "timeframe": "short"|"medium"|"long", "rationale": string},
  "redFlags": [string],
  "followUpQuestions": [string]
}`;

function svc() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function getUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  try {
    const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data } = await c.auth.getUser();
    return data.user?.id ?? null;
  } catch { return null; }
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function jsonResp(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    const action = body.action ?? 'analyze';
    const authHeader = req.headers.get('Authorization');
    const userId = await getUserId(authHeader);

    // ---- List saved notes ----
    if (action === 'list') {
      if (!userId) return jsonResp({ notes: [], authenticated: false });
      const q = svc().from('ai_research_notes')
        .select('id, symbol, name, mode, source_url, source_label, focus, model, generated_at, created_at, report, tags, share_token, share_enabled, share_permissions, share_expires_at')
        .eq('user_id', userId).order('generated_at', { ascending: false }).limit(200);
      if (body.symbol) q.eq('symbol', body.symbol.toUpperCase());
      const { data, error } = await q;
      if (error) return jsonResp({ error: 'query_failed', message: error.message }, 500);
      return jsonResp({ notes: data ?? [] });
    }

    // ---- Get one or many by id (for compare) ----
    if (action === 'get') {
      if (!userId) return jsonResp({ error: 'auth_required' }, 401);
      const ids = body.ids?.length ? body.ids : (body.id ? [body.id] : []);
      if (!ids.length) return jsonResp({ error: 'id or ids required' }, 400);
      const { data, error } = await svc().from('ai_research_notes')
        .select('*').eq('user_id', userId).in('id', ids);
      if (error) return jsonResp({ error: 'query_failed', message: error.message }, 500);
      return jsonResp({ notes: data ?? [] });
    }

    // ---- Delete ----
    if (action === 'delete') {
      if (!userId) return jsonResp({ error: 'auth_required' }, 401);
      if (!body.id) return jsonResp({ error: 'id required' }, 400);
      const { error } = await svc().from('ai_research_notes')
        .delete().eq('user_id', userId).eq('id', body.id);
      if (error) return jsonResp({ error: 'delete_failed', message: error.message }, 500);
      return jsonResp({ ok: true });
    }

    // ---- Update tags on a saved note ----
    if (action === 'set_tags') {
      if (!userId) return jsonResp({ error: 'auth_required' }, 401);
      if (!body.id) return jsonResp({ error: 'id required' }, 400);
      const tags = normalizeTags(body.tags);
      const { data, error } = await svc().from('ai_research_notes')
        .update({ tags }).eq('user_id', userId).eq('id', body.id).select('id, tags').maybeSingle();
      if (error) return jsonResp({ error: 'update_failed', message: error.message }, 500);
      if (!data) return jsonResp({ error: 'not_found' }, 404);
      return jsonResp({ ok: true, tags: data.tags ?? [] });
    }

    // ---- Share: create/update link ----
    if (action === 'share_create') {
      if (!userId) return jsonResp({ error: 'auth_required' }, 401);
      if (!body.id) return jsonResp({ error: 'id required' }, 400);
      const perms = {
        showCitations: body.permissions?.showCitations ?? true,
        showRecommendation: body.permissions?.showRecommendation ?? true,
        showRedFlags: body.permissions?.showRedFlags ?? true,
        showFollowUps: body.permissions?.showFollowUps ?? true,
        showResearchNote: body.permissions?.showResearchNote ?? true,
      };
      // Fetch existing note (auth check + preserve prior token if present)
      const { data: existing, error: e1 } = await svc()
        .from('ai_research_notes').select('id, share_token')
        .eq('user_id', userId).eq('id', body.id).maybeSingle();
      if (e1) return jsonResp({ error: 'query_failed', message: e1.message }, 500);
      if (!existing) return jsonResp({ error: 'not_found' }, 404);
      const tokenBytes = new Uint8Array(24);
      crypto.getRandomValues(tokenBytes);
      const token = existing.share_token || Array.from(tokenBytes)
        .map((b) => b.toString(16).padStart(2, '0')).join('');
      const expires = body.expiresInDays && body.expiresInDays > 0
        ? new Date(Date.now() + body.expiresInDays * 86400_000).toISOString()
        : null;
      const { error: e2 } = await svc().from('ai_research_notes').update({
        share_token: token,
        share_enabled: true,
        share_permissions: perms,
        share_expires_at: expires,
        share_created_at: new Date().toISOString(),
      }).eq('user_id', userId).eq('id', body.id);
      if (e2) return jsonResp({ error: 'update_failed', message: e2.message }, 500);
      return jsonResp({ ok: true, token, permissions: perms, expiresAt: expires });
    }

    if (action === 'share_revoke') {
      if (!userId) return jsonResp({ error: 'auth_required' }, 401);
      if (!body.id) return jsonResp({ error: 'id required' }, 400);
      const { error } = await svc().from('ai_research_notes').update({
        share_enabled: false,
      }).eq('user_id', userId).eq('id', body.id);
      if (error) return jsonResp({ error: 'update_failed', message: error.message }, 500);
      return jsonResp({ ok: true });
    }

    // ---- Share: public read by token (no auth required) ----
    if (action === 'share_get') {
      if (!body.token) return jsonResp({ error: 'token required' }, 400);
      const { data, error } = await svc()
        .from('ai_research_notes')
        .select('id, symbol, name, mode, source_url, source_label, focus, model, generated_at, report, share_permissions, share_enabled, share_expires_at')
        .eq('share_token', body.token).maybeSingle();
      if (error) return jsonResp({ error: 'query_failed', message: error.message }, 500);
      if (!data || !data.share_enabled) return jsonResp({ error: 'not_found' }, 404);
      if (data.share_expires_at && new Date(data.share_expires_at).getTime() < Date.now()) {
        return jsonResp({ error: 'expired' }, 410);
      }
      const perms = (data.share_permissions ?? {}) as Record<string, boolean>;
      // Redact fields per permissions
      const report = { ...(data.report ?? {}) } as any;
      if (perms.showCitations === false) {
        if (Array.isArray(report.keyMetrics)) report.keyMetrics = report.keyMetrics.map((m: any) => ({ ...m, citation: undefined }));
        if (Array.isArray(report.risks)) report.risks = report.risks.map((r: any) => ({ ...r, citation: undefined }));
        if (report.managementTone?.notableQuotes) {
          report.managementTone = { ...report.managementTone, notableQuotes: report.managementTone.notableQuotes.map((q: any) => (typeof q === 'string' ? q : { ...q, section: undefined })) };
        }
      }
      if (perms.showRecommendation === false) report.recommendation = undefined;
      if (perms.showRedFlags === false) report.redFlags = undefined;
      if (perms.showFollowUps === false) report.followUpQuestions = undefined;
      if (perms.showResearchNote === false) report.researchNote = undefined;
      return jsonResp({
        symbol: data.symbol, name: data.name, mode: data.mode,
        sourceUrl: data.source_url, sourceLabel: data.source_label,
        generatedAt: data.generated_at, model: data.model,
        permissions: perms, report,
      });
    }

    // ---- Analyze ----
    const access = await resolveAiAccess(authHeader);
    if (!access.allowed) return aiDeniedResponse(access, corsHeaders);

    if (!body?.symbol || !body?.mode) return jsonResp({ error: 'symbol and mode required' }, 400);
    if (body.mode === 'filing' && !body.filingUrl) {
      return jsonResp({ error: 'filingUrl required for mode=filing' }, 400);
    }
    if (body.mode === 'transcript' && !body.transcript?.trim()) {
      return jsonResp({ error: 'transcript required for mode=transcript' }, 400);
    }

    const sym = body.symbol.toUpperCase();
    const name = body.name || sym;
    const lang = body.lang || 'en';
    const langName = lang === 'it' ? 'Italian' : 'English';
    const focus = (body.focus ?? '').trim();

    // ---- Compute source hash for cache key ----
    const hashInput = body.mode === 'filing'
      ? `filing|${body.filingUrl}|${focus}|${lang}`
      : `transcript|${await sha256Hex(body.transcript!)}|${focus}|${lang}`;
    const source_hash = await sha256Hex(hashInput);

    // ---- Cache lookup ----
    if (userId && !body.force) {
      const { data: existing } = await svc()
        .from('ai_research_notes').select('*')
        .eq('user_id', userId).eq('source_hash', source_hash).maybeSingle();
      if (existing) {
        const age = Date.now() - new Date(existing.generated_at as string).getTime();
        const ttl = body.mode === 'filing' ? CACHE_TTL_FILING_MS : CACHE_TTL_TRANSCRIPT_MS;
        if (age < ttl) {
          return jsonResp({
            symbol: sym, name, mode: body.mode,
            generatedAt: existing.generated_at, model: existing.model,
            providerNotice: existing.provider_notice, sourceNote: existing.source_note,
            report: existing.report, cached: true, noteId: existing.id,
          });
        }
      }
    }

    // ---- Throttle ----
    if (userId) {
      const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
      const { count } = await svc()
        .from('ai_research_notes').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).gte('created_at', oneHourAgo);
      if ((count ?? 0) >= HOURLY_LIMIT) {
        return jsonResp({
          error: 'throttled',
          message: `Hourly AI research limit reached (${HOURLY_LIMIT}/hour). Reuse a saved note or try again later.`,
        }, 429);
      }
    }

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
      return jsonResp({ error: 'source_too_short', note: 'The document text was too short to analyze. Try a different filing URL or paste the full transcript.' }, 422);
    }

    const cfg = await resolveAIConfig(req.headers.get('Authorization'));
    const focusLine = focus ? `The analyst has asked to focus on: ${focus}. Weight the note accordingly, but still cover every section.` : '';
    const modeLabel = body.mode === 'filing' ? 'SEC filing / annual or interim report' : 'earnings call transcript';

    const systemPrompt = `You are a senior sell-side equity research analyst at a top-tier investment bank covering ${name} (${sym}).
You read ${modeLabel} documents and extract signal for portfolio managers.
Write ALL prose fields in ${langName}. Be number-driven, specific, and balanced — separate what management SAID from what the numbers SHOW.
Never fabricate figures: only quote numbers that appear in the source document. If a metric is not disclosed, say "not disclosed".
CITATIONS (mandatory): for every keyMetric, every risk, and every notable quote, include a "citation" with:
  - "quote": a verbatim excerpt from the source document (<= 220 characters, no ellipses added by you)
  - "section": the section label in which it appears (e.g. "Item 1A. Risk Factors", "Item 7. MD&A", "Financial Highlights", "Guidance", "CEO Prepared Remarks", "Q&A - Operator", or "Source Document" if truly unknown)
If the source is silent on something, DO NOT invent a citation — omit that item instead.
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

    if (r.status === 429) return jsonResp({ error: 'rate_limited', message: 'AI is temporarily rate-limited. Please retry shortly.' }, 429);
    if (r.status === 402) return jsonResp({ error: 'credits_exhausted', message: 'AI credits exhausted for this workspace.' }, 402);
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`AI ${r.status}: ${t.slice(0, 400)}`);
    }
    const j = await r.json();
    let parsed: any = {};
    try { parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? '{}'); } catch { parsed = {}; }

    // ---- Save (upsert) ----
    let noteId: string | null = null;
    if (userId) {
      const { data: saved, error: saveErr } = await svc()
        .from('ai_research_notes')
        .upsert({
          user_id: userId, symbol: sym, name, mode: body.mode, source_hash,
          source_url: body.filingUrl ?? null, source_label: body.filingLabel ?? null,
          focus: focus || null, report: parsed, model: cfg.model,
          provider_notice: cfg.notice ?? null, source_note: note ?? null,
          generated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,source_hash' })
        .select('id').maybeSingle();
      if (saveErr) console.error('save note error', saveErr);
      noteId = saved?.id ?? null;
    }

    return jsonResp({
      symbol: sym,
      name,
      mode: body.mode,
      generatedAt: new Date().toISOString(),
      model: cfg.model,
      providerNotice: cfg.notice,
      sourceNote: note,
      report: parsed,
      cached: false,
      noteId,
    });
  } catch (e) {
    console.error('equity-research-analyst error', e);
    return jsonResp({ error: 'internal', message: String((e as Error)?.message ?? e) }, 500);
  }
});